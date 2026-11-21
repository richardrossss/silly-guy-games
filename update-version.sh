#!/bin/sh
# run before each commit so open pages know to reload
echo "{\"v\":\"$(date +%s)\"}" > version.json
