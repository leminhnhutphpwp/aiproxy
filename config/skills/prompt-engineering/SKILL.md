# Prompt Engineering

## Core Principles
- **Garbage In, Garbage Out**: Prompt quality directly determines output quality
- **Be Specific**: Clear instructions with constraints outperform vague requests
- **Iterate**: Prompt engineering is empirical — test, analyze, refine, repeat
- **Structure Matters**: Format, delimiters, and ordering significantly affect results

## Key Patterns
- **Few-Shot Prompting**: Provide 2-5 examples in the prompt showing desired input/output format
- **Chain-of-Thought (CoT)**: Ask the model to reason step-by-step before answering
- **System Prompt + User Prompt**: Clear separation of instructions from input
- **Role Prompting**: "You are an expert {role}" sets context and constraints
- **Structured Output**: Request JSON/YAML with explicit schema and keys
- **ReAct (Reasoning + Acting)**: LLM reasons, decides an action, observes result, repeats

## Best Practices
- Use clear delimiters (```, ---, XML tags) to separate instructions from input
- Place instructions before input — attention is highest at start and end
- Explicitly state what to do AND what NOT to do
- Use temperature 0 for deterministic outputs (code, extraction); higher for creative (writing)
- Add "Think step-by-step" before complex reasoning tasks
- For extraction tasks, specify output format with examples
- Use persona/role consistently — don't switch mid-prompt
- Test prompts on a curated evaluation set — not just 1-2 examples

## Common Pitfalls
- **Prompt injection**: User input can override instructions — always sanitize and separate
- **Leaking examples**: Few-shot examples in system prompt consume tokens — keep them concise
- **Over-promising**: Vague prompts like "write a great article" produce generic results
- **Ignoring token limits**: Long prompts + long responses exceed context window
- **Chain-of-thought on simple tasks**: Adds latency and tokens for no benefit — use direct output

## Tools & Techniques
- **LangChain / LlamaIndex**: Frameworks for prompt chains, RAG, and agents
- **Promptfoo**: Evaluate prompts across models and configurations
- **OpenAI Evals**: Framework for prompt and model evaluation
- **Version your prompts**: Store prompt templates in version control with test cases
- **Prompt templates**: Use string templates with variables for reusable prompts
