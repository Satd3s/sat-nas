#!/bin/bash
NEW_VERSION=$1
if [ -z "$NEW_VERSION" ]; then
  echo "Error: Por favor especifica la versión (ej. ./update_spotiflac.sh v7.2.0)"
  exit 1
fi
echo ">>> Actualizando SpotiFLAC a la versión $NEW_VERSION..."
docker build --build-arg SPOTIFLAC_VERSION=$NEW_VERSION -f Dockerfile.spotiflac -t spotiflac:latest .
docker stop spotiflac || true
docker rm spotiflac || true
docker run -d --name spotiflac \
  --restart unless-stopped \
  -p 8095:5800 \
  -v /opt/spotiflac-config:/config \
  -v /mnt/NAS_STORAGE/Music:/storage \
  spotiflac:latest
echo ">>> Actualización completada."
