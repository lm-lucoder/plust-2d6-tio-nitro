import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

/** Load the installed Foundry runtime; never substitute fake field classes. */
export async function loadFoundryCommon() {
  const roots = [];
  if (process.env.FOUNDRY_PATH) roots.push(path.resolve(process.env.FOUNDRY_PATH));
  else {
    let directory = fileURLToPath(new URL('../../', import.meta.url));
    while (true) {
      roots.push(directory);
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  for (const root of roots) {
    const candidates = root.endsWith('.mjs') ? [root] : [
      path.join(root, 'common', 'server.mjs'),
      path.join(root, 'resources', 'app', 'common', 'server.mjs'),
      path.join(root, 'Foundry', 'resources', 'app', 'common', 'server.mjs'),
      path.join(root, 'Contents', 'Resources', 'app', 'common', 'server.mjs')
    ];
    for (const candidate of candidates) {
      try { await access(candidate); } catch { continue; }
      return import(pathToFileURL(candidate).href);
    }
  }
  if (process.env.FOUNDRY_PATH) throw new Error('FOUNDRY_PATH does not contain common/server.mjs. Point it at an installed Foundry application.');
  return null;
}

/** Supply document registration metadata, with real BaseActor/Item and collections. */
export async function registerSystemModels({actorDataModels, itemDataModels}) {
  const manifest = JSON.parse(await readFile(new URL('../../system.json', import.meta.url), 'utf8'));
  globalThis.CONFIG = {
    Actor: {dataModels: actorDataModels}, Item: {dataModels: itemDataModels},
    Token: {}, Canvas: {}, ActiveEffect: {}
  };
  globalThis.game = {
    model: Object.fromEntries(Object.entries(manifest.documentTypes).map(([document, types]) =>
      [document, Object.fromEntries(Object.keys(types).map(type => [type, {}]))])),
    system: manifest,
    release: {version: manifest.compatibility.verified},
    modules: new Map()
  };
  return manifest;
}
