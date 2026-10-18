# SWI-Prolog solver

Jalankan seluruh unit test dari root repository:

```powershell
swipl -q -f none -g "load_files('prolog/tests/test_solver.pl'),run_tests,halt"
```

Jalankan CLI dengan fixture valid:

```powershell
Get-Content -Raw -Encoding UTF8 prolog/tests/fixtures/valid.json |
  swipl -q -f none -s prolog/solver_cli.pl -g "solver_cli:main" -t halt
```

CLI membaca satu objek JSON schema version 1 dari stdin. stdout hanya berisi satu objek JSON protokol; diagnostik teknis diarahkan ke stderr.
