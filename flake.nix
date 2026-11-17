{
  description = "Kizu benchmarks against Go, Zig and C";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/5d2b81a7a3be3e2f832879028e4d60abbf58e9a0";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachSystem [ "aarch64-darwin" "x86_64-linux" "aarch64-linux" ] (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        # The released compiler, the same archive kizu's scripts/seed.txt pins.
        release = {
          version = "v0.6.0";
          archives = {
            aarch64-darwin = { platform = "darwin-arm64"; sha256 = "94aa3c80205a5e6e15432898d3ed4ea3dee0449e74110e75f5bb8293cc4c7842"; };
            x86_64-linux = { platform = "linux-amd64"; sha256 = "8702af8306d27acb287e64498ea7ef913f2ab6c7a4e4fb08f8468e4fe440eb73"; };
            aarch64-linux = { platform = "linux-arm64"; sha256 = "d56e0ae31baf37d0baf4001ff42426e614fff0cf3d38289b61bbf80df392e2d9"; };
          };
        };
        archive = release.archives.${system};
        kizu = pkgs.stdenvNoCC.mkDerivation {
          pname = "kizu";
          version = release.version;
          src = pkgs.fetchurl {
            url = "https://github.com/kizu-lang/kizu/releases/download/${release.version}/kizu-${release.version}-${archive.platform}.tar.gz";
            sha256 = archive.sha256;
          };
          sourceRoot = ".";
          nativeBuildInputs = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.autoPatchelfHook ];
          installPhase = ''
            dir=$(find . -maxdepth 1 -type d -name 'kizu-*' | head -1)
            mkdir -p $out
            cp -R "$dir"/bin "$dir"/lib $out/
          '';
        };
      in
      {
        packages.kizu = kizu;
        devShells.default = pkgs.mkShell {
          packages = [
            kizu
            pkgs.clang
            pkgs.go
            pkgs.zig
            pkgs.hyperfine
            pkgs.gnumake
            pkgs.python3
          ] ++ pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.valgrind pkgs.time pkgs.util-linux pkgs.perf pkgs.strace ];
          shellHook = ''
            export CC=clang
            # The C variant c-O3native asks for the host CPU; the wrapper drops it otherwise.
            export NIX_ENFORCE_NO_NATIVE=0
          '';
        };
      }
    );
}
