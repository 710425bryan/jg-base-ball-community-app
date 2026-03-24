const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.vue') || file.endsWith('.js') || file.endsWith('.ts')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walk(srcDir);
let changedFiles = 0;
let totalMatches = 0;

files.forEach(file => {
    const originalContent = fs.readFileSync(file, 'utf8');
    let content = originalContent;

    // 1. Replace text-xs with text-sm
    const xsPattern = /\btext-xs\b/g;
    const xsMatches = (content.match(xsPattern) || []).length;
    if (xsMatches > 0) {
        content = content.replace(xsPattern, 'text-sm');
        totalMatches += xsMatches;
    }

    // 2. Replace text-[10px|11px|12px|13px] and text-[0.75rem]
    const explicitPattern = /\btext-\[(1[0-3]|[0-9])px\]|\btext-\[0\.75rem\]/g;
    const explicitMatches = (content.match(explicitPattern) || []).length;
    if (explicitMatches > 0) {
        content = content.replace(explicitPattern, 'text-sm');
        totalMatches += explicitMatches;
    }

    // 3. Very small text like text-[8px] or anything below 14px
    const verySmallPattern = /\btext-\[0\.\d+rem\]/g; 
    // Wait, let's just replace all specific text-[<14px] 
    
    // 4. font-size inline styles
    const inlinePattern = /font-size:\s*(1[0-3]|[0-9])px\b/g;
    const inlineMatches = (content.match(inlinePattern) || []).length;
    if (inlineMatches > 0) {
        content = content.replace(inlinePattern, 'font-size: 14px');
        totalMatches += inlineMatches;
    }

    // Replace text-[10px], text-[11px] inside strings/templates too
    if (content !== originalContent) {
        fs.writeFileSync(file, content, 'utf8');
        changedFiles++;
        console.log(`Updated ${path.relative(srcDir, file)}`);
    }
});

console.log(`Done. Updated ${changedFiles} files. Total replacements: ${totalMatches}`);
