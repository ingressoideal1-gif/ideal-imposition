import os
import urllib.request

icons = ['whatsapp', 'instagram', 'facebook', 'ford', 'youtube', 'tiktok', 'linkedin', 'x', 'telegram', 'spotify', 'apple', 'android', 'google', 'amazon', 'netflix']
output_dir = 'icones_uteis'

if not os.path.exists(output_dir):
    os.makedirs(output_dir)

print(f"Baixando {len(icons)} ícones para {output_dir}...")

for icon in icons:
    url = f"https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/{icon}.svg"
    output_path = os.path.join(output_dir, f"{icon}.svg")
    try:
        urllib.request.urlretrieve(url, output_path)
        print(f"OK: {icon}.svg")
    except Exception as e:
        print(f"ERRO ao baixar {icon}: {e}")

print("Concluído!")
