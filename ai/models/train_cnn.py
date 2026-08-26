"""
Trains a CNN to classify product images as genuine or fake.
Expects: dataset/train/genuine, dataset/train/fake, dataset/val/genuine, dataset/val/fake
"""
import os
import tensorflow as tf
from tensorflow.keras import layers, models

IMG_SIZE = (128, 128)
BATCH_SIZE = 16
EPOCHS = 5
DATA_DIR = "dataset"
MODEL_OUT = "models/saved_models/cnn_fake_detector.h5"

train_ds = tf.keras.utils.image_dataset_from_directory(
    f"{DATA_DIR}/train", image_size=IMG_SIZE, batch_size=BATCH_SIZE, label_mode="binary"
)
val_ds = tf.keras.utils.image_dataset_from_directory(
    f"{DATA_DIR}/val", image_size=IMG_SIZE, batch_size=BATCH_SIZE, label_mode="binary"
)

print("Class order (0/1):", train_ds.class_names)

normalize = layers.Rescaling(1.0 / 255)
train_ds = train_ds.map(lambda x, y: (normalize(x), y))
val_ds = val_ds.map(lambda x, y: (normalize(x), y))

model = models.Sequential([
    layers.Input(shape=(*IMG_SIZE, 3)),
    layers.Conv2D(32, 3, activation="relu"),
    layers.MaxPooling2D(),
    layers.Conv2D(64, 3, activation="relu"),
    layers.MaxPooling2D(),
    layers.Flatten(),
    layers.Dense(64, activation="relu"),
    layers.Dropout(0.3),
    layers.Dense(1, activation="sigmoid"),
])

model.compile(optimizer="adam", loss="binary_crossentropy", metrics=["accuracy"])
model.summary()

model.fit(train_ds, validation_data=val_ds, epochs=EPOCHS)

os.makedirs("models/saved_models", exist_ok=True)
model.save(MODEL_OUT)
print(f"Saved model to {MODEL_OUT}")