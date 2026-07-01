import fs from 'fs';
import path from 'path';

// Since we might not have glob installed directly, I'll write a simple recursive function
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
  
  // Replace the cdn script tag (any variation)
  content = content.replace(/<script src="https:\/\/cdn\.tailwindcss\.com[^>]*><\/script>/g, '');
  
  // Replace the tailwind-config script block
  content = content.replace(/<script id="tailwind-config">[\s\S]*?<\/script>/g, '');
  
  // Add the link to the compiled css just before </head> if not already there
  if (!content.includes('tailwind-output.css') && content.includes('</head>')) {
      content = content.replace('</head>', '  <link rel="stylesheet" href="/css/tailwind-output.css" />\n</head>');
  }

  // Remove empty lines that might have been left over where the scripts were
  content = content.replace(/^\s*[\r\n]/gm, (match) => {
    // only remove empty lines if we have consecutive empty lines, or just clean it up a bit
    return match; // Actually it's safer to leave empty lines than mess up formatting
  });

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    modifiedCount++;
    console.log(`Updated ${file}`);
  }
}

console.log(`Finished updating ${modifiedCount} files.`);
