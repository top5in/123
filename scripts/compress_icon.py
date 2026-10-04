from pathlib import Path
from PIL import Image

path = Path('/home/ubuntu/monthly-planner/assets/images/icon.png')
image = Image.open(path).convert('RGB')
image.thumbnail((768, 768), Image.Resampling.LANCZOS)
image = image.quantize(colors=256, method=Image.Quantize.MEDIANCUT).convert('RGB')
image.save(path, format='PNG', optimize=True, compress_level=9)
print(path.stat().st_size)
