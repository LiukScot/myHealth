# Agent memory (continual learning)

  
## MUST DO

  

- Call vibe_check after planning and before major actions.
	- Provide the full user request and your current plan.
	- Optionally, record resolved issues with vibe_learn.

- periodically call continual-learning mcp


## Learned User Preferences

  

- Do not mark Linear issues as Done until the user has tested and explicitly says it's ok.

- Revert any fixes or code changes that don't solve the problem and then explain why earlier attempts failed.

- remember to check mcp installed and use them when deemed useful.

- When explaining something (e.g., implementing new things, explaining a specific behaviour etc), start with an ELI5-style summary before deeper details.

- If you notice the user edits files in any way, DO NOT force back their edits without consent.

- Prefer broad, reusable CSS rules over micro-specific ones to keep the stylesheet clean and maintainable.
  

## Learned Workspace Facts