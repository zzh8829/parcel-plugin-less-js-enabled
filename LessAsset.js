const { Asset } = require("parcel-bundler");

const { promisify } = require("@parcel/utils");
const fs = require("@parcel/fs");
const path = require("path");

const Resolver = require("parcel-bundler/src/Resolver");
const localRequire = require("parcel-bundler/src/utils/localRequire");
const parseCSSImport = require("parcel-bundler/src/utils/parseCSSImport");
const config = require("parcel-bundler/src/utils/config");

class LESSAsset extends Asset {
  constructor(name, options) {
    super(name, options);
    this.type = "css";
  }

  // Make .lessrc and .lessrc.js work with antd
  async getConfig(filenames, opts = {}) {
    if (opts.packageKey) {
      let pkg = await this.getPackage();
      if (pkg && pkg[opts.packageKey]) {
        return clone(pkg[opts.packageKey]);
      }
    }

    let loadPath = opts.path || this.name;

    // Fix antd less loading
    if (this.name.includes(path.join("node_modules", "antd"))) {
      while (path.basename(loadPath) !== "node_modules") {
        loadPath = path.dirname(loadPath);
      }
    }

    // Resolve the config file
    let conf = await config.resolve(loadPath, filenames);

    if (conf) {
      // Add as a dependency so it is added to the watcher and invalidates
      // this asset when the config changes.
      this.addDependency(conf, { includedInParent: true });
      if (opts.load === false) {
        return conf;
      }

      return config.load(loadPath, filenames);
    }

    return null;
  }

  async parse(code) {
    // less should be installed locally in the module that's being required
    let less = await localRequire("less", this.name);
    let render = promisify(less.render.bind(less));

    let opts =
      (await this.getConfig([".lessrc", ".lessrc.js"], {
        packageKey: "less"
      })) || {};

    opts.javascriptEnabled = true;
    opts.filename = this.name;
    opts.plugins = (opts.plugins || []).concat(urlPlugin(this));
    if (this.options.sourceMaps) {
      opts.sourceMap = { outputSourceFiles: true };
    }

    return render(code, opts);
  }

  collectDependencies() {
    for (let dep of this.ast.imports) {
      this.addDependency(dep, { includedInParent: true });
    }
  }

  generate() {
    let map;
    if (this.ast && this.ast.map) {
      map = JSON.parse(this.ast.map.toString());
      map.sources = map.sources.map(v =>
        path.relative(this.options.rootDir, v)
      );
    }
    return [
      {
        type: "css",
        value: this.ast ? this.ast.css : "",
        hasDependencies: false,
        map
      }
    ];
  }
}

function urlPlugin(asset) {
  return {
    install: (less, pluginManager) => {
      let visitor = new less.visitors.Visitor({
        visitUrl: node => {
          node.value.value = asset.addURLDependency(
            node.value.value,
            node.currentFileInfo.filename
          );
          return node;
        }
      });

      visitor.run = visitor.visit;
      pluginManager.addVisitor(visitor);

      let LessFileManager = getFileManager(less, asset.options);
      pluginManager.addFileManager(new LessFileManager());
    }
  };
}

function getFileManager(less, options) {
  const resolver = new Resolver({
    extensions: [".css", ".less"],
    rootDir: options.rootDir
  });

  class LessFileManager extends less.FileManager {
    supports() {
      return true;
    }

    supportsSync() {
      return false;
    }

    async loadFile(filename, currentDirectory) {
      filename = parseCSSImport(filename);
      let resolved = await resolver.resolve(
        filename,
        path.join(currentDirectory, "index")
      );
      return {
        contents: await fs.readFile(resolved.path, "utf8"),
        filename: resolved.path
      };
    }
  }

  return LessFileManager;
}

module.exports = LESSAsset;
