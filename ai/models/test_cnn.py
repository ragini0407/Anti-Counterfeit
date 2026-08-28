import tensorflow as tf
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix

IMG_SIZE = (128, 128)
BATCH_SIZE = 16

TEST_DIR = "dataset/test"
MODEL_PATH = "models/saved_models/cnn_fake_detector.h5"

# --------------------------------------------------
# 1. Load trained CNN model
# --------------------------------------------------

model = tf.keras.models.load_model(MODEL_PATH)

# --------------------------------------------------
# 2. Load test dataset
# --------------------------------------------------

test_ds = tf.keras.utils.image_dataset_from_directory(
    TEST_DIR,
    image_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
    label_mode="binary",
    shuffle=False
)

# IMPORTANT:
# Save class names BEFORE applying .map()
class_names = test_ds.class_names

print("Class order:", class_names)

# --------------------------------------------------
# 3. Normalize images
# --------------------------------------------------

normalize = tf.keras.layers.Rescaling(1.0 / 255)

test_ds = test_ds.map(
    lambda x, y: (normalize(x), y)
)

# --------------------------------------------------
# 4. Evaluate model
# --------------------------------------------------

loss, accuracy = model.evaluate(test_ds, verbose=1)

print(f"\nTest Loss: {loss:.4f}")
print(f"Test Accuracy: {accuracy * 100:.2f}%")

# --------------------------------------------------
# 5. Get actual labels and predictions
# --------------------------------------------------

y_true = []
y_prob = []

for images, labels in test_ds:

    predictions = model.predict(images, verbose=0)

    y_true.extend(labels.numpy().flatten())
    y_prob.extend(predictions.flatten())

# Convert to NumPy arrays
y_true = np.array(y_true).astype(int)
y_prob = np.array(y_prob)

# Convert probabilities to class predictions
# 0 = fake
# 1 = genuine

y_pred = (y_prob >= 0.5).astype(int)

# --------------------------------------------------
# 6. Classification Report
# --------------------------------------------------

print("\nClassification Report:")

print(
    classification_report(
        y_true,
        y_pred,
        target_names=class_names,
        digits=4
    )
)

# --------------------------------------------------
# 7. Confusion Matrix
# --------------------------------------------------

cm = confusion_matrix(y_true, y_pred)

print("Confusion Matrix:")
print(cm)

# --------------------------------------------------
# 8. Explain confusion matrix
# --------------------------------------------------

print("\nConfusion Matrix Explanation:")

print(f"                 Predicted {class_names[0]}   Predicted {class_names[1]}")
print(
    f"Actual {class_names[0]:<10} {cm[0][0]:>8}          {cm[0][1]:>8}"
)
print(
    f"Actual {class_names[1]:<10} {cm[1][0]:>8}          {cm[1][1]:>8}"
)