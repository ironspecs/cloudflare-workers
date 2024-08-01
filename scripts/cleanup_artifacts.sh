#!/bin/sh
#
# Performs a cleanup operation across all Node.js projects within a monorepo.
# It iteratively checks and removes `node_modules`, `package-lock.json`, `dist`, and `build` directories
# from each project directory one level deep from the root. The script provides feedback on the presence
# of these items before removing them.
#
# Instructions for use:
# 1. Place this script at the root of your monorepo.
# 2. Ensure the script is executable by running: chmod +x verbose_cleanup.sh
# 3. Execute the script by running: ./verbose_cleanup.sh
#
# Note: This script assumes a standard project structure with each Node.js project in its own subdirectory.
#

# Iterate over each subdirectory one level deep from the root
for dir in */ ; do
    echo "Inspecting ${dir}..."

    # Define an array of items to check and remove
    items=("node_modules" "package-lock.json" "dist" "build")

    for item in "${items[@]}"; do
        # Check if the item exists before attempting removal
        if [ -e "${dir}${item}" ]; then
            echo "Found ${item} in ${dir}, removing..."
            rm -rf "${dir}${item}"
        fi
    done
done

echo "Artifact cleanup completed."
