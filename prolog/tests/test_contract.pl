:- begin_tests(contract_fixtures).

:- use_module(library(http/json)).
:- use_module(library(process)).
:- use_module(library(readutil)).
:- use_module('../solver_cli', []).

contract_fixture_path(Name, Path) :-
    source_file(contract_fixture_path(_, _), Source),
    file_directory_name(Source, TestDir),
    directory_file_path(TestDir, fixtures, FixtureDir),
    directory_file_path(FixtureDir, Name, Path).

contract_load(Name, Input, Text) :-
    contract_fixture_path(Name, Path),
    read_file_to_string(Path, Text, [encoding(utf8)]),
    atom_json_dict(Text, Input, [value_string_as(string)]).

contract_run(Name, Response, ExitCode, Input) :-
    contract_load(Name, Input, Text),
    current_prolog_flag(executable, Executable),
    source_file(solver_cli:main, CliPath),
    process_create(Executable,
                   ['-q', '-f', none, '-s', CliPath,
                    '-g', 'solver_cli:main', '-t', halt],
                   [stdin(pipe(In)), stdout(pipe(Out)), stderr(pipe(Err)),
                    process(Pid)]),
    set_stream(In, encoding(utf8)),
    set_stream(Out, encoding(utf8)),
    set_stream(Err, encoding(utf8)),
    write(In, Text),
    close(In),
    read_string(Out, _, Stdout),
    read_string(Err, _, Stderr),
    close(Out), close(Err),
    process_wait(Pid, exit(ExitCode)),
    assertion(Stderr == ""),
    split_string(Stdout, "\n", "", Lines0),
    exclude(==(""), Lines0, Lines),
    Lines = [Line],
    atom_json_dict(Line, Response, [value_string_as(atom)]).

assert_contract(Name, Status, ExitCode) :-
    contract_run(Name, Response, ExitCode, Input),
    assertion(Response.status == Status),
    assertion(Response.schema_version == 2),
    assertion(Response.source_revision =:= Input.source_revision),
    ( memberchk(Status, [success, unsatisfiable])
    -> maplist(contract_praktikum_id, Input.praktikum, InputIds),
       sort(InputIds, ExpectedIds),
       maplist(domain_candidate_id, Response.domain_candidates, CandidateIds),
       assertion(CandidateIds == ExpectedIds),
       forall(member(Candidate, Response.domain_candidates),
              assertion(Candidate.theoretical_pairs =:=
                        Candidate.slot_count * Candidate.laboratory_count)),
       ( Status == success -> verify_assignments(Input, Response.assignments)
       ; assertion(Response.assignments == [])
       )
    ; assertion(is_dict(Response.error)),
      assertion(\+ get_dict(domain_candidates, Response, _))
    ).

verify_assignments(Input, Assignments) :-
    maplist(contract_praktikum_id, Input.praktikum, ExpectedIds),
    maplist(contract_assignment_id, Assignments, ActualIds),
    assertion(ActualIds == ExpectedIds),
    forall(member(A, Assignments), verify_assignment(Input, A)),
    forall((select(A, Assignments, Rest), member(B, Rest)),
           verify_pair(Input, A, B)).

contract_praktikum_id(P, P.id).
contract_assignment_id(A, A.praktikum_id).
domain_candidate_id(C, C.praktikum_id).

verify_assignment(Input, A) :-
    member(P, Input.praktikum), P.id =:= A.praktikum_id,
    member(S, Input.slot_waktu), S.id =:= A.slot_id,
    member(L, Input.laboratorium), L.id =:= A.laboratorium_id,
    member(G, Input.kelompok), G.id =:= P.kelompok_id,
    assertion(L.kapasitas >= G.jumlah_peserta),
    assertion(memberchk(_{kelompok_id:P.kelompok_id, slot_id:A.slot_id},
                        Input.ketersediaan_kelompok)),
    assertion(memberchk(_{asisten_id:P.asisten_id, slot_id:A.slot_id},
                        Input.ketersediaan_asisten)).

verify_pair(Input, A, B) :-
    member(PA, Input.praktikum), PA.id =:= A.praktikum_id,
    member(PB, Input.praktikum), PB.id =:= B.praktikum_id,
    ( PA.kelompok_id =:= PB.kelompok_id -> assertion(A.slot_id =\= B.slot_id)
    ; true ),
    ( PA.asisten_id =:= PB.asisten_id -> assertion(A.slot_id =\= B.slot_id)
    ; true ),
    ( A.slot_id =:= B.slot_id ->
        assertion(A.laboratorium_id =\= B.laboratorium_id)
    ; true ).

test(success_multiple) :-
    assert_contract('contract-success-multiple.json', success, 0).
test(unsat_group) :-
    assert_contract('contract-unsat-group.json', unsatisfiable, 0).
test(unsat_assistant) :-
    assert_contract('contract-unsat-assistant.json', unsatisfiable, 0).
test(unsat_laboratory) :-
    assert_contract('contract-unsat-laboratory.json', unsatisfiable, 0).
test(unsat_availability) :-
    assert_contract('contract-unsat-availability.json', unsatisfiable, 0).
test(invalid_schema) :-
    assert_contract('contract-invalid-schema.json', invalid_input, 2).
test(invalid_foreign_key) :-
    assert_contract('contract-invalid-foreign-key.json', invalid_input, 2).
test(invalid_slot_overlap) :-
    assert_contract('contract-invalid-slot-overlap.json', invalid_input, 2).
test(empty_dataset) :-
    assert_contract('contract-empty-dataset.json', success, 0).
test(multiple_solutions_are_deterministic) :-
    contract_run('contract-multiple-solutions.json', First, 0, _),
    contract_run('contract-multiple-solutions.json', Second, 0, Input),
    assertion(First =@= Second),
    First.assignments = [Assignment],
    assertion(Assignment.praktikum_id =:= 1),
    assertion(Assignment.slot_id =:= 1),
    assertion(Assignment.laboratorium_id =:= 1),
    verify_assignments(Input, First.assignments).

:- end_tests(contract_fixtures).
