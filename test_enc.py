with open('frontend/index.html', 'rb') as f:
    content = f.read()
    
# Find the string "Numera"
idx = content.find(b'Numera')
if idx != -1:
    print(content[max(0, idx-10):idx+30])

idx2 = content.find(b'Numera\xef\xbf\xbd')
if idx2 != -1:
    print("Found with replacement char:", content[max(0, idx2-10):idx2+30])

