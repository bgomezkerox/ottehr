#!/bin/bash

echo "Current PATH: $PATH"

# Verificar si Node está instalado
if ! command -v node &> /dev/null; then
    echo "Error: Node is not installed. Please install Node.js before running this script."
    exit 1
else
    echo "Node.js está instalado."
fi
