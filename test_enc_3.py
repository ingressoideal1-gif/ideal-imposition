with open('frontend/index.html', 'rb') as f:
    for line in f:
        if b'3. Numera' in line:
            print(line)
