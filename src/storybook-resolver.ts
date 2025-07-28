import fs from 'fs';
import path from 'path';
import { glob } from 'fast-glob';

/**
 * Dynamically resolve Storybook modules from the current project.
 * This has been introduced to better support monorepo structures
 * where Storybook is not installed in the root node_modules.
 * This should resolve Storybook modules from the closest node_modules directory.
 */
let JsPackageManager: any;
let JsPackageManagerFactory: any;
let findConfigFile: any;
let readConfig: any;
let PackageManagerName: any;
let ConfigFile: any;

const resolveStorybookModules = () => {
    // Try multiple resolution strategies for monorepo support
    const resolutionPaths = [
        process.cwd(), // Current working directory
        path.resolve(process.cwd(), 'node_modules'), // Root node_modules
    ];

    // Add any existing .storybook directories to the search paths
    try {
        const storybookDirs = fs.readdirSync(process.cwd())
            .filter(dir => fs.existsSync(path.join(process.cwd(), dir, '.storybook')))
            .map(dir => path.resolve(process.cwd(), dir, 'node_modules'));
        resolutionPaths.push(...storybookDirs);
    } catch (error) {
        // Ignore errors when reading directory
    }

    // Also try to find node_modules in any directory that has a .storybook folder
    // This catches monorepo structures where Storybook might be in subdirectories
    try {
        const storybookConfigDirs = glob.sync('**/.storybook', {
            onlyDirectories: true,
            ignore: ['**/node_modules/**'],
            cwd: process.cwd(),
        });
        
        storybookConfigDirs.forEach(storybookDir => {
            // Get the parent directory of .storybook
            const parentDir = path.dirname(storybookDir);
            const nodeModulesPath = path.resolve(process.cwd(), parentDir, 'node_modules');
            if (!resolutionPaths.includes(nodeModulesPath)) {
                resolutionPaths.push(nodeModulesPath);
            }
        });
    } catch (error) {
        // Ignore errors when globbing
    }

    // Try to resolve from each possible path
    for (const basePath of resolutionPaths) {
        try {
            const storybookCommon = require(require.resolve('storybook/internal/common', { paths: [basePath] }));
            const storybookCsfTools = require(require.resolve('storybook/internal/csf-tools', { paths: [basePath] }));
            
            JsPackageManager = storybookCommon.JsPackageManager;
            JsPackageManagerFactory = storybookCommon.JsPackageManagerFactory;
            findConfigFile = storybookCommon.findConfigFile;
            readConfig = storybookCsfTools.readConfig;
            PackageManagerName = storybookCommon.PackageManagerName;
            ConfigFile = storybookCsfTools.ConfigFile;
            
            console.log(`Found Storybook modules in: ${basePath}`);
            return true;
        } catch (error) {
            // Continue to next path
        }
    }

    // Fallback: try to resolve from the package's own node_modules
    try {
        const storybookCommon = require('storybook/internal/common');
        const storybookCsfTools = require('storybook/internal/csf-tools');
        JsPackageManager = storybookCommon.JsPackageManager;
        JsPackageManagerFactory = storybookCommon.JsPackageManagerFactory;
        findConfigFile = storybookCommon.findConfigFile;
        readConfig = storybookCsfTools.readConfig;
        PackageManagerName = storybookCommon.PackageManagerName;
        ConfigFile = storybookCsfTools.ConfigFile;
        return true;
    } catch (fallbackError) {
        return false;
    }
};

// Initialize the modules
if (!resolveStorybookModules()) {
    console.error('Error: Could not find Storybook modules. Please ensure you are running this tool within a Storybook project.');
    process.exit(1);
}

// Export the resolved modules
export {
    JsPackageManager,
    JsPackageManagerFactory,
    findConfigFile,
    readConfig,
    PackageManagerName,
    ConfigFile,
}; 