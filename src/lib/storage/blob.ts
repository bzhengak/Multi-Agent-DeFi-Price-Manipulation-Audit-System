import * as fs from 'fs';
import * as path from 'path';

const STORAGE_DIR = path.join(process.cwd(), '.storage');

/**
 * Ensure a directory exists, creating it recursively if needed
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Save a JSON-serializable object to a file in the storage directory
 * @param filename - Relative path within the storage directory (e.g., "reports/abc.json")
 * @param data - The data to serialize and save
 * @returns The absolute file path where the data was saved
 */
export async function saveJSON<T>(filename: string, data: T): Promise<string> {
  const filePath = path.join(STORAGE_DIR, filename);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}

/**
 * Load a JSON file from the storage directory
 * @param filename - Relative path within the storage directory
 * @returns The parsed data, or null if the file doesn't exist or can't be parsed
 */
export async function loadJSON<T>(filename: string): Promise<T | null> {
  try {
    const filePath = path.join(STORAGE_DIR, filename);
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * List files in a directory within the storage directory
 * @param prefix - Subdirectory path within the storage directory (e.g., "reports/")
 * @returns Array of filenames in the specified directory
 */
export async function listFiles(prefix: string = ''): Promise<string[]> {
  const dir = path.join(STORAGE_DIR, prefix);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir);
}

/**
 * Delete a file from the storage directory
 * @param filename - Relative path within the storage directory
 */
export async function deleteFile(filename: string): Promise<void> {
  const filePath = path.join(STORAGE_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
