// Copyright (C) CVAT Minus contributors
//
// SPDX-License-Identifier: MIT

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../src');
const localeDir = path.join(root, 'i18n/locales');
const check = process.argv.includes('--check');
const keys = new Set();

function scanFile(filename) {
    const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    const importsTranslator = source.statements.some((node) => (
        ts.isImportDeclaration(node) && node.moduleSpecifier.text === 'i18n'
    ));
    if (!importsTranslator) return;

    function visit(node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
            const [key] = node.arguments;
            if (!key || !ts.isStringLiteralLike(key)) {
                const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
                throw new Error(`Expected a literal message at ${filename}:${line + 1}`);
            }
            keys.add(key.text);
        }
        ts.forEachChild(node, visit);
    }

    visit(source);
}

function scanDirectory(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) scanDirectory(filename);
        else if (/\.tsx?$/.test(entry.name)) scanFile(filename);
    }
}

function placeholders(message) {
    return [...message.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort().join(',');
}

scanDirectory(root);
const sourceKeys = [...keys].sort();
for (const filename of fs.readdirSync(localeDir).filter((name) => name.endsWith('.json'))) {
    const file = path.join(localeDir, filename);
    const translations = JSON.parse(fs.readFileSync(file, 'utf8'));
    const catalog = Object.fromEntries(sourceKeys.map((key) => [key, translations[key] ?? '']));
    if (!check) {
        fs.writeFileSync(file, JSON.stringify(catalog, null, 2) + '\n');
        continue;
    }

    for (const [key, value] of Object.entries(catalog)) {
        if (!value || typeof value !== 'string' || placeholders(key) !== placeholders(value)) {
            process.exitCode = 1;
            process.stderr.write(`${filename}: missing translation or mismatched placeholders for ${key}\n`);
        }
    }
    for (const key of Object.keys(translations)) {
        if (!keys.has(key)) {
            process.exitCode = 1;
            process.stderr.write(`${filename}: unused message: ${key}\n`);
        }
    }
}
process.stdout.write(`${sourceKeys.length} interface messages\n`);
