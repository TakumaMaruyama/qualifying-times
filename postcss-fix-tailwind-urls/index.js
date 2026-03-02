module.exports = function fixTailwindUrls() {
  return {
    postcssPlugin: "postcss-fix-tailwind-urls",
    Declaration(decl) {
      if (typeof decl.value !== "string" || !decl.value.includes("...")) {
        return;
      }

      // Tailwind v4 can emit literal ellipsis URL placeholders.
      // Convert all url(...), url("..."), url('...') patterns to harmless data URLs.
      decl.value = decl.value.replace(/url\(\s*(['"]?)\.\.\.\1\s*\)/g, "url(data:,)");
    },
  };
};
module.exports.postcss = true;
