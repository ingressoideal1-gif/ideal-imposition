with open('frontend/index.html', 'rb') as f:
    content = f.read()

import re
matches = [m.start() for m in re.finditer(b'Numera', content)]
for idx in matches:
    print("Match at", idx, ":", content[max(0, idx-10):idx+30])
