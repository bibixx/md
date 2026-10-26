#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

out=docs/screenshot.png
radius=24     # px at the screenshot's 2x scale, so 12 px as shown on GitHub
outline='#3d444d'

vhs docs/screenshot.tape

magick "$out" \
  \( +clone -alpha extract -fill black -colorize 100 \
     -fill white -draw "roundrectangle 0,0 %[fx:w-1],%[fx:h-1] $radius,$radius" \) \
  -alpha off -compose CopyOpacity -composite \
  -compose Over -fill none -stroke "$outline" -strokewidth 2 \
  -draw "roundrectangle 1,1 %[fx:w-2],%[fx:h-2] $((radius - 1)),$((radius - 1))" \
  "$out"
