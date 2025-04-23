/**
 * Interface for Chromatic configuration file structure
 */
export interface ChromaticConfig {
    $schema?: string;
    projectId?: string;
    storybookBaseDir?: string;
    storybookConfigDir?: string;
    storybookBuildDir?: string;
    externals?: string[];
    onlyChanged?: boolean;
    [key: string]: any;
}

/**
 * Interface for project metadata collected during configuration
 */
export interface ProjectMeta {
    storybookBaseDir: string;
    storybookConfigDir: string;
    storybookBuildDir: string;
    packageManager: string;
    isMonoRepo: boolean;
    framework: string;
    ciEnv: string;
    staticAssets: string[];
} 