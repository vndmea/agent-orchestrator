# Model Routing

Leader and worker models are configured independently from environment variables.

- Leader models handle planning, decomposition, routing, review, and final decisions.
- Worker models handle summarization, draft generation, extraction, and repetitive tasks.
- Mock providers are the default so tests run without real credentials.
- LiteLLM is supported through an OpenAI-compatible endpoint configuration.
