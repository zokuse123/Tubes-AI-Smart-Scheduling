# SWI-Prolog solver

Jalankan seluruh unit test dari root repository:

```powershell
swipl -q -f none -g "load_files(['prolog/tests/test_solver.pl','prolog/tests/test_contract.pl','prolog/tests/test_benchmark.pl']),run_tests,halt"
```

Jalankan CLI dengan fixture valid:

```powershell
Get-Content -Raw -Encoding UTF8 prolog/tests/fixtures/valid.json |
  swipl -q -f none -s prolog/solver_cli.pl -g "solver_cli:main" -t halt
```

CLI membaca satu objek JSON schema version 1 dari stdin. stdout hanya berisi satu objek JSON protokol; diagnostik teknis diarahkan ke stderr.

Jalankan benchmark solver internal dari root repository:

```powershell
swipl -q -f none -s prolog/benchmark.pl -g "benchmark:main" -t halt
```

Benchmark menulis satu laporan JSON ke stdout. Setiap run dibatasi lima detik;
status `timeout` dilaporkan terpisah dari `unsatisfiable`.

Jalankan corpus optimasi dan instrumentasi per fase:

```powershell
swipl -q -f none -s prolog/benchmark_optimization.pl `
  -g "benchmark_optimization:main" -t halt
```

Runner optimasi memakai process wall-clock monotonic dan memisahkan konstruksi
model, pencarian, materialisasi assignment, verifikasi independen, total internal,
serta waktu CLI end-to-end. Setiap kasus internal dibatasi dua detik.
