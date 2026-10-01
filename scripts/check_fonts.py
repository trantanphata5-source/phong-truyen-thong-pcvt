import re
import glob

patterns = [
    re.compile(r'playfair', re.I),
    re.compile(r'["\']inter["\']', re.I),
    re.compile(r'georgia', re.I)
]

files = glob.glob('js/**/*.js', recursive=True) + glob.glob('css/**/*.css', recursive=True) + ['index.html']
found = []

for f in files:
    with open(f, 'r', encoding='utf-8', errors='ignore') as fp:
        for idx, line in enumerate(fp, 1):
            for p in patterns:
                if p.search(line):
                    found.append((f, idx, line.strip()))

print(f"TOTAL FORBIDDEN FONT MATCHES: {len(found)}")
for f, idx, line in found:
    print(f"{f}:{idx}: {line}")
