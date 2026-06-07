import codecs

def fix_mixed_encoding(file_path):
    with open(file_path, 'rb') as f:
        content = f.read()

    # Tentativa de decodificar utf-8. Se falhar, tentamos consertar.
    try:
        text = content.decode('utf-8')
        print(f"{file_path} is already valid utf-8.")
        return False
    except UnicodeDecodeError:
        pass

    # Decodificar byte a byte (ou melhor: como latin-1 e depois converter os trechos utf-8 validos)
    # Mas como o arquivo é 99% utf-8 com alguns bytes latin-1 soltos...
    # Uma abordagem simples: 
    # Em Python, decodificamos tudo como latin-1, isso vai mapear \xc3\xa7 para Ã§
    # Mas queremos o contrário: queremos decodificar o UTF-8 válido e os bytes soltos latin-1.
    
    fixed_bytes = bytearray()
    i = 0
    while i < len(content):
        # Tenta decodificar o maior número de bytes UTF-8 possível
        try:
            # Tenta decodificar até 4 bytes se necessário, mas decode('utf-8') pega tudo.
            # Vamos achar o próximo erro
            content[i:].decode('utf-8')
            # Se não deu erro, o resto é todo utf-8
            fixed_bytes.extend(content[i:])
            break
        except UnicodeDecodeError as e:
            # e.start é o índice do byte inválido relativo a i
            valid_chunk = content[i:i+e.start]
            fixed_bytes.extend(valid_chunk)
            
            # O byte inválido
            bad_byte = content[i+e.start:i+e.start+1]
            
            # Esse bad_byte é um caractere latin-1. Vamos converte-lo para utf-8
            latin_char = bad_byte.decode('latin-1')
            utf8_bytes = latin_char.encode('utf-8')
            fixed_bytes.extend(utf8_bytes)
            
            i += e.start + 1

    with open(file_path, 'wb') as f:
        f.write(fixed_bytes)
        
    print(f"Fixed {file_path}")
    return True

fix_mixed_encoding('frontend/index.html')
fix_mixed_encoding('frontend/script.js')
fix_mixed_encoding('frontend/style.css')
fix_mixed_encoding('engine.py')

