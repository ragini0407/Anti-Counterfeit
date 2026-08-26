const sharp = require("sharp");

const extractVisualFeatures = async (imagePath) => {
    const { data } = await sharp(imagePath)
        .resize(32, 32, {
            fit: "fill"
        })
        .removeAlpha()
        .raw()
        .toBuffer({
            resolveWithObject: true
        });

    // Convert RGB values from 0-255 to 0-1
    const features = Array.from(data).map(
        value => Number((value / 255).toFixed(4))
    );

    return features;
};

const compareVisualFeatures = (referenceFeatures, testFeatures) => {
    if (
        !referenceFeatures ||
        !testFeatures ||
        referenceFeatures.length !== testFeatures.length
    ) {
        throw new Error("Invalid visual feature vectors");
    }
    let squaredDistance = 0;

    for (let i = 0; i < referenceFeatures.length; i++) {
        const difference =
            referenceFeatures[i] - testFeatures[i];

        squaredDistance += difference * difference;
    }

    const distance = Math.sqrt(squaredDistance);

    // Convert distance into a similarity percentage
    const similarity = Math.max(
        0,
        (1 - distance / Math.sqrt(referenceFeatures.length)) * 100
    );

    return Number(similarity.toFixed(2));
};

module.exports = {
    extractVisualFeatures,
    compareVisualFeatures
};