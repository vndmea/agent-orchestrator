import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import type { Command } from "commander";

import type { WorkerRegistration } from "@mcp-code-worker/core";
import {
  getWorkerRegistration,
  listWorkerRegistrations,
  listWorkerSecrets,
  removeWorkerSecret,
  saveWorkerRegistration,
  saveWorkerSecret
} from "@mcp-code-worker/models";

import type { CliIo } from "../index.js";
import { writeOutput } from "../output.js";
import { resolveCommandContext } from "./command-runtime.js";

const CLIENT_PROVIDERS = new Set(["client", "opencode", "claudecode", "codex", "mock"]);

export interface AuthPrompter {
  close?: () => Promise<void> | void;
  confirm: (message: string, defaultValue: boolean) => Promise<boolean>;
  secret: (message: string) => Promise<string>;
  select: <T extends string>(
    message: string,
    options: Array<{
      label: string;
      value: T;
    }>,
    defaultValue: T
  ) => Promise<T>;
  text: (
    message: string,
    options?: {
      allowEmpty?: boolean;
      defaultValue?: string;
    }
  ) => Promise<string>;
}

export interface AuthLoginResult {
  credential: {
    mode: "execute" | "dry-run";
    path: string;
  };
  registration?: {
    mode: "execute" | "dry-run";
    path: string;
  };
  workerId: string;
}

export interface AuthLogoutResult {
  mode: "execute" | "dry-run";
  path: string;
  removed: boolean;
  workerId: string;
}

export const workerNeedsApiCredential = (provider: string): boolean =>
  !CLIENT_PROVIDERS.has(provider);

const toYesNoSuffix = (defaultValue: boolean): string =>
  defaultValue ? " [Y/n]" : " [y/N]";

const normalizeConfirmAnswer = (
  value: string,
  defaultValue: boolean
): boolean | null => {
  const normalized = value.trim().toLowerCase();

  if (normalized.length === 0) {
    return defaultValue;
  }

  if (["y", "yes"].includes(normalized)) {
    return true;
  }

  if (["n", "no"].includes(normalized)) {
    return false;
  }

  return null;
};

const promptHidden = async (message: string): Promise<string> => {
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Interactive secret entry requires a TTY.");
  }

  return await new Promise<string>((resolveSecret, rejectSecret) => {
    const previousRawMode = input.isRaw;
    let value = "";

    const cleanup = (): void => {
      input.off("keypress", onKeypress);
      input.setRawMode(previousRawMode ?? false);
    };
    const finish = (): void => {
      output.write("\n");
      cleanup();
      resolveSecret(value);
    };
    const fail = (error: Error): void => {
      output.write("\n");
      cleanup();
      rejectSecret(error);
    };
    const onKeypress = (chunk: string, key: { ctrl?: boolean; name?: string }) => {
      if (key.ctrl && key.name === "c") {
        fail(new Error("Prompt cancelled."));
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        finish();
        return;
      }

      if (key.name === "backspace") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          output.write("\b \b");
        }
        return;
      }

      if (chunk.length === 1 && chunk >= " " && chunk !== "\u007f") {
        value += chunk;
        output.write("*");
      }
    };

    emitKeypressEvents(input);
    input.on("keypress", onKeypress);
    input.setRawMode(true);
    input.resume();
    output.write(`${message} `);
  });
};

export const createReadlineAuthPrompter = (): AuthPrompter => {
  const readline = createInterface({
    input,
    output
  });

  const select = async <T extends string>(
    message: string,
    options: Array<{
      label: string;
      value: T;
    }>,
    defaultValue: T
  ): Promise<T> => {
    if (!input.isTTY || !output.isTTY) {
      throw new Error("Interactive selection requires a TTY.");
    }

    const defaultIndex = Math.max(
      0,
      options.findIndex((option) => option.value === defaultValue)
    );
    const totalLines = options.length + 1;
    let activeIndex = defaultIndex;
    let rendered = false;

    const render = (): void => {
      if (rendered) {
        output.write(`\u001b[${totalLines}F\u001b[J`);
      }

      output.write(`${message}\n`);

      for (let index = 0; index < options.length; index += 1) {
        const option = options[index];

        if (!option) {
          continue;
        }

        output.write(
          `${index === activeIndex ? "\u001b[36m>\u001b[0m" : " "} ${option.label}\n`
        );
      }

      rendered = true;
    };

    return await new Promise<T>((resolveChoice, rejectChoice) => {
      const previousRawMode = input.isRaw;
      const cleanup = (): void => {
        input.off("keypress", onKeypress);
        input.setRawMode(previousRawMode ?? false);
      };
      const finish = (value: T): void => {
        cleanup();
        resolveChoice(value);
      };
      const fail = (error: Error): void => {
        cleanup();
        rejectChoice(error);
      };
      const onKeypress = (_value: string, key: { ctrl?: boolean; name?: string }) => {
        if (key.ctrl && key.name === "c") {
          fail(new Error("Prompt cancelled."));
          return;
        }

        if (key.name === "up") {
          activeIndex = activeIndex === 0 ? options.length - 1 : activeIndex - 1;
          render();
          return;
        }

        if (key.name === "down") {
          activeIndex = activeIndex === options.length - 1 ? 0 : activeIndex + 1;
          render();
          return;
        }

        if (key.name === "return" || key.name === "enter") {
          finish(options[activeIndex]!.value);
        }
      };

      emitKeypressEvents(input);
      input.on("keypress", onKeypress);
      input.setRawMode(true);
      input.resume();
      render();
    });
  };

  return {
    close: () => {
      readline.close();
      return Promise.resolve();
    },
    confirm: async (message: string, defaultValue: boolean) => {
      while (true) {
        const answer = await readline.question(
          `${message}${toYesNoSuffix(defaultValue)} `
        );
        const parsed = normalizeConfirmAnswer(answer, defaultValue);

        if (parsed !== null) {
          return parsed;
        }

        output.write("Please answer yes or no.\n");
      }
    },
    secret: async (message: string) => promptHidden(message),
    select,
    text: async (
      message: string,
      options: {
        allowEmpty?: boolean;
        defaultValue?: string;
      } = {}
    ) => {
      while (true) {
        const promptSuffix =
          options.defaultValue !== undefined
            ? ` [${options.defaultValue}]`
            : "";
        const answer = await readline.question(`${message}${promptSuffix} `);
        const trimmed = answer.trim();

        if (trimmed.length > 0) {
          return trimmed;
        }

        if (options.defaultValue !== undefined) {
          return options.defaultValue;
        }

        if (options.allowEmpty) {
          return "";
        }

        output.write("Please enter a value.\n");
      }
    }
  };
};

export const persistWorkerCredential = async (options: {
  apiKey: string;
  allowWrite: boolean;
  rootDir?: string;
  workerId: string;
}): Promise<AuthLoginResult> => {
  const apiKey = options.apiKey.trim();

  if (apiKey.length === 0) {
    throw new Error("Worker API key cannot be empty.");
  }

  const context = await resolveCommandContext({
    allowWrite: options.allowWrite,
    rootDir: options.rootDir,
    writeMode: "require-flag"
  });
  const credential = await saveWorkerSecret(
    context,
    options.workerId,
    apiKey,
    options.allowWrite
  );

  return {
    credential,
    workerId: options.workerId
  };
};

const selectWorkerId = async (
  rootDir: string | undefined,
  prompter: AuthPrompter
): Promise<string> => {
  const context = await resolveCommandContext({ rootDir });
  const registrations = await listWorkerRegistrations(
    context.rootDir,
    context.cwStorageDir
  );

  if (registrations.length === 0) {
    return prompter.text("Worker name?", {
      defaultValue: "primary-worker"
    });
  }

  const selected = await prompter.select(
    "Which worker should this credential belong to?",
    [
      ...registrations.map((worker) => ({
        label: `${worker.workerId} (${worker.provider}/${worker.model})`,
        value: worker.workerId
      })),
      {
        label: "Configure another worker",
        value: "__new__"
      }
    ],
    registrations[0]!.workerId
  );

  if (selected !== "__new__") {
    return selected;
  }

  return prompter.text("Worker name?", {
    defaultValue: "primary-worker"
  });
};

const resolveApiKey = async (options: {
  apiKeyEnv?: string;
  prompter?: AuthPrompter;
}): Promise<string> => {
  if (options.apiKeyEnv) {
    const value = process.env[options.apiKeyEnv]?.trim();

    if (!value) {
      throw new Error(`Environment variable ${options.apiKeyEnv} is not set.`);
    }

    return value;
  }

  if (!options.prompter) {
    throw new Error("Use --api-key-env in non-interactive auth login.");
  }

  return options.prompter.secret("API key:");
};

const shouldWriteAuthState = async (options: {
  allowWrite?: boolean;
  hasPrompter: boolean;
  prompter?: AuthPrompter;
}): Promise<boolean> => {
  if (options.allowWrite) {
    return true;
  }

  if (!options.hasPrompter || !options.prompter) {
    throw new Error("--allow-write is required for non-interactive auth changes.");
  }

  return options.prompter.confirm(
    "Save this credential in the local cw SQLite store?",
    true
  );
};

const resolveRegistrationInput = async (options: {
  baseUrl?: string;
  existing: WorkerRegistration | null;
  model?: string;
  prompter?: AuthPrompter;
  provider?: string;
}): Promise<{
  baseURL?: string;
  model: string;
  provider: string;
} | null> => {
  if (
    options.existing &&
    !options.provider &&
    !options.model &&
    !options.baseUrl
  ) {
    return null;
  }

  const provider =
    options.provider ??
    options.existing?.provider ??
    await options.prompter?.text("Worker provider?", {
      defaultValue: "openai-compatible"
    });
  const model =
    options.model ??
    options.existing?.model ??
    await options.prompter?.text("Worker model?");

  if (!provider || !model) {
    throw new Error(
      "Registering a worker during auth login requires --provider and --model in non-interactive mode."
    );
  }

  const promptedBaseUrl =
    options.baseUrl ??
    options.existing?.baseURL ??
    await options.prompter?.text("Worker base URL? Leave blank to skip.", {
      allowEmpty: true,
      defaultValue: ""
    });

  return {
    ...(promptedBaseUrl ? { baseURL: promptedBaseUrl } : {}),
    model,
    provider
  };
};

const formatAuthLoginResult = (result: AuthLoginResult): string[] => [
  `auth login: ${result.workerId}`,
  result.registration
    ? `worker registration: ${result.registration.mode} (${result.registration.path})`
    : "worker registration: unchanged",
  `credential: ${result.credential.mode} (${result.credential.path})`,
  `next: cw worker readiness --worker ${result.workerId} --probe`
];

const formatAuthLogoutResult = (result: AuthLogoutResult): string[] => [
  `auth logout: ${result.workerId}`,
  result.mode === "execute"
    ? result.removed
      ? "credential removed"
      : "credential was already absent"
    : "dry-run: credential would be removed",
  `store: ${result.path}`
];

const formatAuthList = (
  entries: Array<{
    credentialUpdatedAt?: string;
    hasCredential: boolean;
    model?: string;
    provider?: string;
    workerId: string;
  }>
): string[] => {
  const lines = ["worker credentials"];

  if (entries.length === 0) {
    lines.push("none");
    return lines;
  }

  for (const entry of entries) {
    lines.push(
      [
        entry.workerId,
        entry.provider && entry.model ? `(${entry.provider}/${entry.model})` : null,
        entry.hasCredential ? "credential=yes" : "credential=no",
        entry.credentialUpdatedAt ? `updated=${entry.credentialUpdatedAt}` : null
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
    );
  }

  return lines;
};

export const registerAuthCommand = (
  program: Command,
  io: CliIo,
  injectedPrompter?: AuthPrompter
): void => {
  const auth = program.command("auth").description("Manage local worker credentials.");

  auth
    .command("login")
    .description("Store a worker API credential in the local cw SQLite store.")
    .option("--root <path>", "Workspace root")
    .option("--worker <workerId>", "Worker id. If omitted in a TTY, cw asks you to choose one.")
    .option("--provider <provider>", "Register or update the worker provider during login.")
    .option("--model <model>", "Register or update the worker model during login.")
    .option("--base-url <url>", "Register or update the worker base URL during login.")
    .option("--api-key-env <name>", "Read the API key from this environment variable.")
    .option("--allow-write", "Persist the credential and any requested worker registration.", false)
    .action(
      async (options: {
        allowWrite: boolean;
        apiKeyEnv?: string;
        baseUrl?: string;
        model?: string;
        provider?: string;
        root?: string;
        worker?: string;
      }) => {
        const canPrompt =
          Boolean(injectedPrompter) || (process.stdin.isTTY && process.stdout.isTTY);
        const prompter =
          injectedPrompter ?? (canPrompt ? createReadlineAuthPrompter() : undefined);

        try {
          const workerId = options.worker ?? (
            prompter
              ? await selectWorkerId(options.root, prompter)
              : (() => {
                  throw new Error("--worker is required in non-interactive auth login.");
                })()
          );
          const allowWrite = await shouldWriteAuthState({
            allowWrite: options.allowWrite,
            hasPrompter: Boolean(prompter),
            prompter
          });
          const context = await resolveCommandContext({
            allowWrite,
            rootDir: options.root,
            writeMode: "require-flag"
          });
          const existing = await getWorkerRegistration(
            context.rootDir,
            workerId,
            context.cwStorageDir
          );
          const registrationInput = await resolveRegistrationInput({
            baseUrl: options.baseUrl,
            existing,
            model: options.model,
            prompter,
            provider: options.provider
          });
          const apiKey = await resolveApiKey({
            apiKeyEnv: options.apiKeyEnv,
            prompter
          });
          let registration: AuthLoginResult["registration"];

          if (registrationInput) {
            const now = new Date().toISOString();
            registration = await saveWorkerRegistration(
              context,
              {
                workerId,
                provider: registrationInput.provider,
                model: registrationInput.model,
                baseURL: registrationInput.baseURL,
                enabled: existing?.enabled ?? true,
                tags: existing?.tags ?? ["auth"],
                notes: existing?.notes,
                createdAt: existing?.createdAt ?? now,
                updatedAt: now
              },
              allowWrite
            );
          }

          const credential = await saveWorkerSecret(
            context,
            workerId,
            apiKey,
            allowWrite
          );
          const result: AuthLoginResult = {
            credential,
            ...(registration ? { registration } : {}),
            workerId
          };

          writeOutput(io, result, formatAuthLoginResult(result));
        } finally {
          if (!injectedPrompter) {
            await prompter?.close?.();
          }
        }
      }
    );

  auth
    .command("logout")
    .description("Remove a worker API credential without unregistering the worker.")
    .option("--root <path>", "Workspace root")
    .option("--worker <workerId>", "Worker id. If omitted in a TTY, cw asks you to choose one.")
    .option("--allow-write", "Persist the credential removal.", false)
    .action(async (options: { allowWrite: boolean; root?: string; worker?: string }) => {
      const canPrompt =
        Boolean(injectedPrompter) || (process.stdin.isTTY && process.stdout.isTTY);
      const prompter =
        injectedPrompter ?? (canPrompt ? createReadlineAuthPrompter() : undefined);

      try {
        const workerId = options.worker ?? (
          prompter
            ? await selectWorkerId(options.root, prompter)
            : (() => {
                throw new Error("--worker is required in non-interactive auth logout.");
              })()
        );
        const allowWrite = await shouldWriteAuthState({
          allowWrite: options.allowWrite,
          hasPrompter: Boolean(prompter),
          prompter
        });
        const context = await resolveCommandContext({
          allowWrite,
          rootDir: options.root,
          writeMode: "require-flag"
        });
        const removal = await removeWorkerSecret(context, workerId, allowWrite);
        const result: AuthLogoutResult = {
          ...removal,
          workerId
        };

        writeOutput(io, result, formatAuthLogoutResult(result));
      } finally {
        if (!injectedPrompter) {
          await prompter?.close?.();
        }
      }
    });

  auth
    .command("list")
    .description("List configured workers and whether a local credential exists.")
    .option("--root <path>", "Workspace root")
    .action(async (options: { root?: string }) => {
      const context = await resolveCommandContext({
        rootDir: options.root
      });
      const [registrations, secrets] = await Promise.all([
        listWorkerRegistrations(context.rootDir, context.cwStorageDir),
        listWorkerSecrets(context.rootDir, context.cwStorageDir)
      ]);
      const secretByWorker = new Map(
        secrets.map((secret) => [secret.workerId, secret])
      );
      const registrationByWorker = new Map(
        registrations.map((worker) => [worker.workerId, worker])
      );
      const workerIds = Array.from(
        new Set([
          ...registrations.map((worker) => worker.workerId),
          ...secrets.map((secret) => secret.workerId)
        ])
      ).sort();
      const entries = workerIds.map((workerId) => {
        const worker = registrationByWorker.get(workerId);
        const secret = secretByWorker.get(workerId);

        return {
          credentialUpdatedAt: secret?.updatedAt,
          hasCredential: Boolean(secret),
          model: worker?.model,
          provider: worker?.provider,
          workerId
        };
      });

      writeOutput(io, entries, formatAuthList(entries));
    });
};
