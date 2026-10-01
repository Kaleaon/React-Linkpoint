#!/usr/bin/env bash
# Regenerates core/src/test/resources/j2k/*.j2k and the matching *.ppm / *.pgm reference decodes
# with OpenJPEG (libopenjp2-dev + ImageMagick required). The Kotlin decoder is tested against the
# reference output of OpenJPEG for each file.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../../core/src/test/resources/j2k"
work="$(mktemp -d)"
gcc -O2 -o "$work/opjtool" "$here/opjtool.c" $(pkg-config --cflags libopenjp2 2>/dev/null || echo -I/usr/include/openjpeg-2.5) -lopenjp2
tool="$work/opjtool"
mkdir -p "$out"
rm -f "$out"/*.j2k "$out"/*.ppm "$out"/*.pgm

convert -size 96x64 -seed 7 plasma:fractal -resize 61x37! -depth 8 "$work/rgb.ppm"
convert "$work/rgb.ppm" -colorspace Gray -depth 8 "$work/gray.pgm"
convert "$work/rgb.ppm" -crop 17x1+0+0 +repage -depth 8 "$work/row.pgm" || true
convert "$work/gray.pgm" -crop 5x3+0+0 +repage -depth 8 "$work/tiny.pgm"
convert "$work/gray.pgm" -crop 1x23+0+0 +repage -depth 8 "$work/col.pgm"

# name | source image | encoder options
cases=(
 "rev5            rgb  -levels 5"
 "rev_nomct       rgb  -levels 5 -nomct"
 "rev_gray        gray -levels 5"
 "irrev5          rgb  -levels 5 -irrev"
 "irrev_gray      gray -levels 4 -irrev"
 "lvl0            rgb  -levels 0"
 "lvl1            rgb  -levels 1 -irrev"
 "cblk16          rgb  -levels 3 -cblk 16 16"
 "cblk64x16       rgb  -levels 3 -cblk 64 16"
 "prog_lrcp       rgb  -levels 3 -prog LRCP -layers 3 30 10 0"
 "prog_rlcp       rgb  -levels 3 -prog RLCP -layers 3 30 10 0"
 "prog_rpcl       rgb  -levels 3 -prog RPCL -layers 3 30 10 0"
 "prog_pcrl       rgb  -levels 3 -prog PCRL -layers 3 30 10 0"
 "prog_cprl       rgb  -levels 3 -prog CPRL -layers 3 30 10 0"
 "prec_rpcl       rgb  -levels 3 -prog RPCL -prec 32,32 32,32 16,16 16,16"
 "prec_pcrl       rgb  -levels 3 -prog PCRL -prec 32,32 32,32 16,16 16,16"
 "prec_cprl       rgb  -levels 3 -prog CPRL -prec 32,32 32,32 16,16 16,16"
 "prec_lrcp       rgb  -levels 3 -prog LRCP -prec 32,32 32,32 16,16 16,16"
 "tiles           rgb  -levels 3 -tile 32 24"
 "tiles_rpcl      rgb  -levels 3 -tile 32 24 -prog RPCL -prec 16,16 16,16 16,16 16,16"
 "tiles_irrev     rgb  -levels 3 -tile 25 25 -irrev"
 "mode_bypass     rgb  -levels 3 -modes 1"
 "mode_reset      rgb  -levels 3 -modes 2"
 "mode_termall    rgb  -levels 3 -modes 4"
 "mode_vsc        rgb  -levels 3 -modes 8"
 "mode_pterm      rgb  -levels 3 -modes 16"
 "mode_segsym     rgb  -levels 3 -modes 32"
 "mode_bypass_term rgb -levels 3 -modes 5"
 "mode_all        rgb  -levels 3 -modes 63"
 "mode_all_irrev  rgb  -levels 3 -modes 63 -irrev"
 "mode_bypass_layers rgb -levels 3 -modes 1 -layers 4 40 20 5 0"
 "sop_eph         rgb  -levels 3 -sop -eph"
 "layers5         rgb  -levels 4 -layers 5 80 40 20 8 0"
 "layers_irrev    rgb  -levels 4 -irrev -layers 3 40 12 0"
 "offset          rgb  -levels 3 -offset 3 5"
 "offset_irrev    rgb  -levels 3 -offset 7 1 -irrev"
 "tiny            tiny -levels 1"
 "tiny_irrev      tiny -levels 1 -irrev"
 "row             row  -levels 1"
 "col             col  -levels 1 -irrev"
 "sl_like         rgb  -levels 5 -prog RPCL -cblk 64 64 -prec 256,256 256,256 128,128 64,64 32,32 32,32 -layers 3 40 10 0"
)
for line in "${cases[@]}"; do
  set -- $line
  name=$1; src=$2; shift 2
  case "$src" in rgb) f="$work/rgb.ppm"; ext=ppm;; *) f="$work/$src.pgm"; ext=pgm;; esac
  if "$tool" enc "$f" "$out/$name.j2k" "$@" && "$tool" dec "$out/$name.j2k" "$out/$name.$ext" 0; then :; else echo "SKIPPED (encoder refused): $name $*"; rm -f "$out/$name.j2k" "$out/$name.$ext"; fi
done
# Reduced-resolution references.
for name in rev5 irrev5 tiles prog_rpcl; do
  "$tool" dec "$out/$name.j2k" "$out/$name.reduce1.ppm" 1
  "$tool" dec "$out/$name.j2k" "$out/$name.reduce2.ppm" 2
done
echo "wrote $(ls "$out"/*.j2k | wc -l) streams"
