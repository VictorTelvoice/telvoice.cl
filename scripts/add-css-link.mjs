import fs from 'fs';
import path from 'path';

function findHtmlFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === '.git') continue;
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findHtmlFiles(filePath, fileList);
    } else if (file.endsWith('.html')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const htmlFiles = findHtmlFiles('.');

let modifiedCount = 0;

for (const file of htmlFiles) {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;
  
  if (!content.includes('tailwind-output.css') && /<\/head>/i.test(content)) {
      content = content.replace(/<\/head>/i, '  <link rel="stylesheet" href="/css/tailwind-output.css" />\n</head>');
  }

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    modifiedCount++;
    console.log(`Added CSS to ${file}`);
  }
}

console.log(`Finished adding CSS to ${modifiedCount} files.`);
