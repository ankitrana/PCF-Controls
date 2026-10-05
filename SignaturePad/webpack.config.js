// Merged into the pcf-scripts webpack config (enabled by featureconfig.json).
// @fluentui/react-icons bundles @griffel/react, whose ES modules import "react/jsx-runtime"
// without an extension. React 16 has no "exports" map, so strict ESM resolution fails.
module.exports = {
    module: {
        rules: [
            {
                test: /\.m?js$/,
                resolve: { fullySpecified: false },
            },
        ],
    },
};
