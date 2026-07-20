# chapters/

Place your source chapter HTML files here, named `chapter-01.html`,
`chapter-02.html`, etc. (two-digit, zero-padded).

This folder is intentionally empty in this source-only release — your
original book content (chapters/build/output from your own project)
was excluded from this package by design; see the exclude list in the
release request that produced this ZIP.

Requirements each chapter file must meet: see USER_GUIDE.md →
"Preparing your chapters".

Once your files are here, run:

    npm install
    npm run build-book

`build/` and `output/` will be created automatically.
