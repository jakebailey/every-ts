module.exports = {
    target: (dependencyName, [{ semver, version, operator, major, minor, patch, release, build }]) => {
        if (dependencyName === "eslint") return "minor";
        if (major === "0") return "minor";
        return "latest";
    },
    reject: (name, semver) => {
        if (name === "adm-zip") {
            return true;
        }
        return false;
    },
};
