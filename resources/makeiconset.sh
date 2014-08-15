#!/bin/bash

FILE=$1

mkdir nw.iconset
sips -z 16 16     $FILE --out nw.iconset/icon_16x16.png
sips -z 32 32     $FILE --out nw.iconset/icon_16x16@2x.png
sips -z 32 32     $FILE --out nw.iconset/icon_32x32.png
sips -z 64 64     $FILE --out nw.iconset/icon_32x32@2x.png
sips -z 128 128   $FILE --out nw.iconset/icon_128x128.png
sips -z 256 256   $FILE --out nw.iconset/icon_128x128@2x.png
sips -z 256 256   $FILE --out nw.iconset/icon_256x256.png
sips -z 512 512   $FILE --out nw.iconset/icon_256x256@2x.png
sips -z 512 512   $FILE --out nw.iconset/icon_512x512.png
cp $FILE nw.iconset/icon_512x512@2x.png
iconutil -c icns nw.iconset
rm -R nw.iconset

echo
echo "nw.icns created"
