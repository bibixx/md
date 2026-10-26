# Run through docs/screenshot.sh, which also rounds the corners and adds the outline.

Set Shell "bash"
Set FontFamily "Menlo"
Set FontSize 32
Set Width 2160
Set Height 1470
Set Padding 48
Set Theme "GitHub Dark"

Hide
Type "clear && bun bin/md.ts docs/demo.md"
Enter
Sleep 2s
Show
Sleep 500ms

Screenshot docs/screenshot.png
