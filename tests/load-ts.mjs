import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  transpileModule,
  ModuleKind,
  ScriptTarget,
  SyntaxKind,
  isImportDeclaration,
  visitEachChild,
} from 'typescript';

const compiledDirectory=mkdtempSync(join(tmpdir(),'atelier-test-modules-'));
const compiled=new Map();
process.once('exit',()=>rmSync(compiledDirectory,{recursive:true,force:true}));

function compile(url) {
  if(compiled.has(url.href)) return compiled.get(url.href);
  const output=join(compiledDirectory,createHash('sha256').update(url.href).digest('hex')+'.mjs');
  const outputUrl=pathToFileURL(output).href;
  // Register before visiting imports so circular modules retain their identities.
  compiled.set(url.href,outputUrl);
  const require = createRequire(url);
  const result = transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
    transformers: {
      before: [
        (context) => {
          const visit = (node) => {
            if (
              isImportDeclaration(node) &&
              node.importClause?.phaseModifier !== SyntaxKind.TypeKeyword
            ) {
              const specifier = node.moduleSpecifier.text;
              let resolved;
              try { resolved = require.resolve(specifier); }
              catch (error) {
                if (!specifier.startsWith('.')) throw error;
                resolved = require.resolve(`${specifier}.ts`);
              }
              return context.factory.updateImportDeclaration(
                node,
                node.modifiers,
                node.importClause,
                context.factory.createStringLiteral(
                  /\.[cm]?tsx?$/.test(resolved) && specifier.startsWith('.')
                    ? compile(pathToFileURL(resolved))
                    : resolved.startsWith('node:') ? resolved : pathToFileURL(resolved).href,
                ),
                node.attributes,
              );
            }
            return visitEachChild(node, visit, context);
          };
          return (root) => visit(root);
        },
      ],
    },
  });
  writeFileSync(output,result.outputText);
  return outputUrl;
}

export async function loadTs(relative) {
  return import(compile(new URL(relative,import.meta.url)));
}
