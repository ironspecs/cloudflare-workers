#!/bin/sh
#
# This script enforces specific rules for Wrangler projects within a monorepo.
#
# It searches each subdirectory for a wrangler.toml file. If found,
# it then checks the corresponding package.json file to ensure it does not contain
# dependencies or devDependencies. If any are found, it prints an error message
# and exits with failure.
#
# Please move those dependencies to the root of the project.
#

# ANSI colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Flag to track the overall success status
success=true

# Navigate through each subdirectory one level deep from the root
for dir in */ ; do
    # Check for the existence of a wrangler.toml file
    if ls ${dir}wrangler.toml 1> /dev/null 2>&1; then
        echo "Found Wrangler configuration in ${dir}"

        # Path to the package.json file
        package_json="${dir}package.json"

        # Check if package.json exists
        if [ -f "$package_json" ]; then
            # Look for dependencies and devDependencies in package.json
            if grep -E '"(dependencies|devDependencies)": \{' $package_json; then
                echo "${RED}Error: ${package_json} contains dependencies or devDependencies.${NC}"
                success=false
            else
                echo "${GREEN}${package_json} is correctly configured.${NC}"
            fi
        fi
    fi
done

# Check the overall success status
if [ "$success" = false ]; then
    echo "${RED}Validation failed. Some projects contain disallowed configurations.${NC}"
    exit 1
else
    echo "${GREEN}All projects passed validation.${NC}"
fi
