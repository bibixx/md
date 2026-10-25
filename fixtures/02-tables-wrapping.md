A table too wide for the screen, so cells wrap:

| Command | What it does | Notes |
|---------|--------------|-------|
| configuration | Reads and validates the settings file | Looks in `$XDG_CONFIG_HOME/example/` first, then falls back to the home directory |
| serve | Starts the local server | Listens on port 8080 unless `--port` is given |
| synchronise | Pulls changes from the remote | Runs the hooks in `~/.config/example/hooks/` before and after, if there are any |
| completions | Prints shell completion scripts | Supports bash, zsh and fish; other shells may work but are not tested |

One cell long enough to need more than four lines, which switches to the vertical layout:

| Name | Description |
|------|-------------|
| alpha | This description is deliberately very long so that at a normal terminal width the cell has to wrap onto more than four lines, and the renderer gives up on the box layout and prints each row as header and value pairs instead. It keeps going for a while to make sure that happens even on a wide screen with plenty of room for the text to spread out. |
| beta | short |

Many columns, so even the longest words don't fit and words get cut:

| Identifier | Environment | Configuration | Deployment | Observability | Authentication | Authorization | Localization |
|------------|-------------|---------------|------------|---------------|----------------|---------------|--------------|
| production-eu-west | kubernetes | helm-values | progressive | opentelemetry | oauth2-pkce | rbac-policies | translations |

Wide characters (CJK and emoji take two columns each):

| Language | Greeting | Mood |
|----------|----------|------|
| Japanese | こんにちは | 😀 |
| Chinese | 你好 | 🎉🎉 |
| Polish | Cześć | 👍 |
