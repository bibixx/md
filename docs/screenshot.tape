# Regenerates docs/screenshot.png, the screenshot in the README: `vhs docs/screenshot.tape`
# (needs VHS: https://github.com/charmbracelet/vhs). Run it from the repository root.

Set Shell "bash"
Set FontFamily "Menlo"
Set FontSize 32
Set Width 2160
Set Height 1470
Set Padding 48
Set Theme "GitHub Dark"

# start the viewer without showing the command being typed
Hide
Type "clear && bun bin/md.mjs docs/demo.md"
Enter
Sleep 2s
Show
Sleep 500ms

Screenshot docs/screenshot.png
