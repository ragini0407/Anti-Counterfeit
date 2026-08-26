"""
Creates a tiny FAKE dataset of colored squares (green = 'genuine', red = 'fake')
just to smoke-test train_cnn.py tonight. NOT real training data --
delete the dataset/ folder tomorrow once the team picks a real product category.
"""
import os
import numpy as np
from PIL import Image

random_state = np.random.RandomState(42)

def make_image(base_color, path):
    arr = np.full((128, 128, 3), base_color, dtype=np.int16)
    arr += random_state.randint(0, 30, arr.shape)
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    Image.fromarray(arr).save(path)

folders = {
    "dataset/train/genuine": ((0, 150, 0), 40),
    "dataset/train/fake": ((150, 0, 0), 40),
    "dataset/val/genuine": ((0, 150, 0), 10),
    "dataset/val/fake": ((150, 0, 0), 10),
}

for folder, (color, count) in folders.items():
    os.makedirs(folder, exist_ok=True)
    for i in range(count):
        make_image(color, os.path.join(folder, f"img_{i}.png"))

print("Dummy dataset created under dataset/. Run models/train_cnn.py to smoke-test the pipeline.")