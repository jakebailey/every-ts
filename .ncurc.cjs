module.exports = {
    target: (dependencyName, [{ major }]) => {
        if (dependencyName === "@types/node") return "minor";
        if (major === "0") return "minor";
        return "latest";
    },
};
