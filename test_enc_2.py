with open('frontend/index.html', 'r', encoding='utf-8') as f:
    for i, line in enumerate(f):
        if 'Numeração 2' in line:
            print(f"Line {i+1}: {line.strip()}")
