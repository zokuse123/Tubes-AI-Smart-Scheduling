:- begin_tests(smart_lab_solver).

:- use_module(library(http/json)).
:- use_module(library(process)).
:- use_module(library(readutil)).
:- use_module('../solver').
:- use_module('../validation').
:- use_module('../solver_cli').
:- use_module('fault_cli', []).

fixture_path(Name, Path) :-
    source_file(fixture_path(_, _), Source),
    file_directory_name(Source, TestDir),
    directory_file_path(TestDir, fixtures, FixtureDir),
    directory_file_path(FixtureDir, Name, Path).

load_fixture(Name, Dict) :-
    fixture_path(Name, Path),
    setup_call_cleanup(
        open(Path, read, Stream, [encoding(utf8)]),
        json_read_dict(Stream, Dict, [value_string_as(string)]),
        close(Stream)),
    !.

fixture_string(Name, String) :-
    fixture_path(Name, Path),
    read_file_to_string(Path, String, [encoding(utf8)]).

validated_fixture(Name, Data) :-
    load_fixture(Name, Input),
    once(validate_input(Input, Data)).

single_task_data(Data) :-
    load_fixture('valid.json', Input),
    Input.praktikum = [First|_],
    Input.kelompok = [FirstGroup|_],
    GroupAvailability = [_{kelompok_id:1, slot_id:1},
                         _{kelompok_id:1, slot_id:2}],
    Data = Input.put(_{praktikum:[First], kelompok:[FirstGroup],
                       ketersediaan_kelompok:GroupAvailability}).

two_owner_data(Data) :-
    load_fixture('valid.json', Input),
    Groups = [_{id:1, jumlah_peserta:20}, _{id:2, jumlah_peserta:18}],
    Assistants = [_{id:1}, _{id:2}],
    Practices = [
        _{id:1, mata_praktikum_id:1, kelompok_id:1, asisten_id:1},
        _{id:2, mata_praktikum_id:1, kelompok_id:2, asisten_id:2}
    ],
    GroupAvailability = [
        _{kelompok_id:1, slot_id:1},
        _{kelompok_id:2, slot_id:1}
    ],
    AssistantAvailability = [
        _{asisten_id:1, slot_id:1},
        _{asisten_id:2, slot_id:1}
    ],
    Data = Input.put(_{kelompok:Groups, asisten:Assistants,
                       praktikum:Practices,
                       ketersediaan_kelompok:GroupAvailability,
                       ketersediaan_asisten:AssistantAvailability,
                       slot_waktu:[_{id:1, hari:1,
                                    jam_mulai:"08:00", jam_selesai:"10:00"}]}).

process_dict(Input, Response, ExitCode) :-
    atom_json_dict(String, Input, [as(string)]),
    process_json_string(String, Response, ExitCode),
    !.

assignment_praktikum_id(Assignment, Id) :- Id = Assignment.praktikum_id.
praktikum_id(Praktikum, Id) :- Id = Praktikum.id.
slot_id(Slot, Id) :- Id = Slot.id.
lab_id(Lab, Id) :- Id = Lab.id.

test(satisfiable_fixture) :-
    validated_fixture('valid.json', Data),
    once(solve(Data, Assignments)),
    assertion(Assignments =@= [
        _{praktikum_id:1, slot_id:1, laboratorium_id:1},
        _{praktikum_id:2, slot_id:2, laboratorium_id:1}
    ]).

test(unsatisfiable_fixture, [fail]) :-
    validated_fixture('unsatisfiable.json', Data),
    solve(Data, _).

test(c01_exactly_one_assignment_per_praktikum) :-
    validated_fixture('valid.json', Data),
    once(solve(Data, Assignments)),
    maplist(assignment_praktikum_id, Assignments, AssignmentIds),
    maplist(praktikum_id, Data.praktikum, PraktikumIds),
    assertion(AssignmentIds == PraktikumIds).

test(c02_slot_is_registered) :-
    validated_fixture('valid.json', Data),
    once(solve(Data, Assignments)),
    maplist(slot_id, Data.slot_waktu, SlotIds),
    forall(member(A, Assignments), memberchk(A.slot_id, SlotIds)).

test(c03_laboratory_is_registered) :-
    validated_fixture('valid.json', Data),
    once(solve(Data, Assignments)),
    maplist(lab_id, Data.laboratorium, LabIds),
    forall(member(A, Assignments), memberchk(A.laboratorium_id, LabIds)).

test(c04_capacity_insufficient, [fail]) :-
    validated_fixture('unsatisfiable.json', Data),
    solve(Data, _).

test(c05_group_conflict, [fail]) :-
    load_fixture('valid.json', Input),
    SameGroupPractices = [
        _{id:1, mata_praktikum_id:1, kelompok_id:1, asisten_id:1},
        _{id:2, mata_praktikum_id:1, kelompok_id:1, asisten_id:2}
    ],
    OneSlot = [_{id:1, hari:1, jam_mulai:"08:00", jam_selesai:"10:00"}],
    Availability = [_{kelompok_id:1, slot_id:1}],
    Assistants = [_{id:1}, _{id:2}],
    AssistantAvailability = [_{asisten_id:1, slot_id:1},
                             _{asisten_id:2, slot_id:1}],
    Candidate = Input.put(_{praktikum:SameGroupPractices, slot_waktu:OneSlot,
                            kelompok:[_{id:1, jumlah_peserta:20}],
                            asisten:Assistants,
                            ketersediaan_kelompok:Availability,
                            ketersediaan_asisten:AssistantAvailability}),
    validate_input(Candidate, Data),
    solve(Data, _).

test(c06_assistant_conflict, [fail]) :-
    two_owner_data(Input),
    Practices = [
        _{id:1, mata_praktikum_id:1, kelompok_id:1, asisten_id:1},
        _{id:2, mata_praktikum_id:1, kelompok_id:2, asisten_id:1}
    ],
    Candidate = Input.put(_{praktikum:Practices,
                            asisten:[_{id:1}],
                            ketersediaan_asisten:[_{asisten_id:1, slot_id:1}]}),
    validate_input(Candidate, Data),
    solve(Data, _).

test(c07_laboratory_conflict, [fail]) :-
    two_owner_data(Input),
    validate_input(Input, Data),
    solve(Data, _).

test(c08_group_availability_empty, [fail]) :-
    single_task_data(Input),
    Candidate = Input.put(ketersediaan_kelompok, []),
    validate_input(Candidate, Data),
    solve(Data, _).

test(c09_assistant_availability_empty, [fail]) :-
    single_task_data(Input),
    Candidate = Input.put(ketersediaan_asisten, []),
    validate_input(Candidate, Data),
    solve(Data, _).

test(invalid_reference) :-
    load_fixture('valid.json', Input),
    Input.praktikum = [First|Rest],
    Broken = First.put(kelompok_id, 999),
    Candidate = Input.put(praktikum, [Broken|Rest]),
    process_dict(Candidate, Response, ExitCode),
    assertion(ExitCode == 2),
    assertion(Response.status == invalid_input),
    assertion(Response.error.code == 'INVALID_REFERENCE').

test(duplicate_id) :-
    load_fixture('valid.json', Input),
    Input.kelompok = [First|_],
    Candidate = Input.put(kelompok, [First, First]),
    process_dict(Candidate, Response, ExitCode),
    assertion(ExitCode == 2),
    assertion(Response.error.code == 'DUPLICATE_ID').

test(duplicate_availability_pair) :-
    load_fixture('valid.json', Input),
    Input.ketersediaan_kelompok = [First|Rest],
    Candidate = Input.put(ketersediaan_kelompok, [First,First|Rest]),
    process_dict(Candidate, Response, ExitCode),
    assertion(ExitCode == 2),
    assertion(Response.error.code == 'DUPLICATE_AVAILABILITY').

test(wrong_schema_version) :-
    load_fixture('valid.json', Input),
    process_dict(Input.put(schema_version, 2), Response, ExitCode),
    assertion(ExitCode == 2),
    assertion(Response.error.code == 'UNSUPPORTED_SCHEMA_VERSION').

test(malformed_json) :-
    fixture_string('malformed.json', String),
    process_json_string(String, Response, ExitCode),
    assertion(ExitCode == 2),
    assertion(Response.source_revision == null),
    assertion(Response.error.code == 'MALFORMED_JSON').

test(invalid_type) :-
    load_fixture('valid.json', Input),
    process_dict(Input.put(source_revision, "7"), Response, ExitCode),
    assertion(ExitCode == 2),
    assertion(Response.source_revision == null),
    assertion(Response.status == invalid_input).

test(negative_integer_revision_is_echoed) :-
    load_fixture('valid.json', Input),
    process_dict(Input.put(source_revision, -1), Response, ExitCode),
    assertion(ExitCode == 2),
    assertion(Response.source_revision == -1),
    assertion(Response.status == invalid_input).

test(overlapping_slots_rejected) :-
    load_fixture('valid.json', Input),
    Overlap = [
        _{id:1, hari:1, jam_mulai:"08:00", jam_selesai:"10:00"},
        _{id:2, hari:1, jam_mulai:"09:00", jam_selesai:"11:00"}
    ],
    process_dict(Input.put(slot_waktu, Overlap), Response, ExitCode),
    assertion(ExitCode == 2),
    assertion(Response.status == invalid_input).

test(slot_duration_must_be_120_minutes) :-
    load_fixture('valid.json', Input),
    Input.slot_waktu = [First|Rest],
    Broken = First.put(jam_selesai, "09:30"),
    process_dict(Input.put(slot_waktu, [Broken|Rest]), Response, ExitCode),
    assertion(ExitCode == 2),
    assertion(Response.status == invalid_input).

test(unknown_field_rejected) :-
    load_fixture('valid.json', Input),
    Candidate = Input.put(unexpected, true),
    process_dict(Candidate, Response, ExitCode),
    assertion(ExitCode == 2),
    assertion(Response.error.code == 'UNKNOWN_FIELD').

test(indexed_error_path) :-
    load_fixture('valid.json', Input),
    Input.praktikum = [First,Second],
    Broken = Second.put(kelompok_id, 999),
    process_dict(Input.put(praktikum, [First,Broken]), Response, 2),
    assertion(Response.error.path == "praktikum[1].kelompok_id").

test(empty_dataset_success) :-
    load_fixture('valid.json', Input),
    Empty = Input.put(_{mata_praktikum:[], kelompok:[], asisten:[],
                        laboratorium:[], slot_waktu:[], praktikum:[],
                        ketersediaan_kelompok:[], ketersediaan_asisten:[]}),
    process_dict(Empty, Response, 0),
    assertion(Response.status == success),
    assertion(Response.assignments == []).

test(single_activity_success) :-
    single_task_data(Input),
    process_dict(Input, Response, 0),
    assertion(Response.status == success),
    assertion(Response.assignments = [_]).

test(adjacent_slots_are_valid) :-
    load_fixture('valid.json', Input),
    process_dict(Input, Response, 0),
    assertion(Response.status == success).

test(time_boundaries_are_valid) :-
    load_fixture('valid.json', Input),
    Slots = [_{id:1, hari:1, jam_mulai:"00:00", jam_selesai:"02:00"},
             _{id:2, hari:1, jam_mulai:"21:59", jam_selesai:"23:59"}],
    process_dict(Input.put(slot_waktu, Slots), Response, 0),
    assertion(Response.status == success).

test(time_24_00_is_invalid) :-
    load_fixture('valid.json', Input),
    Input.slot_waktu = [First|Rest],
    Broken = First.put(_{jam_mulai:"22:00", jam_selesai:"24:00"}),
    process_dict(Input.put(slot_waktu, [Broken|Rest]), Response, 2),
    assertion(Response.status == invalid_input).

test(same_clock_on_different_days_is_valid) :-
    load_fixture('valid.json', Input),
    Slots = [_{id:1, hari:1, jam_mulai:"08:00", jam_selesai:"10:00"},
             _{id:2, hari:2, jam_mulai:"08:00", jam_selesai:"10:00"}],
    process_dict(Input.put(slot_waktu, Slots), Response, 0),
    assertion(Response.status == success).

test(permuted_input_has_same_output) :-
    load_fixture('valid.json', Input),
    reverse(Input.mata_praktikum, Mata),
    reverse(Input.kelompok, Kelompok),
    reverse(Input.asisten, Asisten),
    reverse(Input.laboratorium, Labs),
    reverse(Input.slot_waktu, Slots),
    reverse(Input.praktikum, Praktikum),
    reverse(Input.ketersediaan_kelompok, KK),
    reverse(Input.ketersediaan_asisten, KA),
    Permuted = Input.put(_{mata_praktikum:Mata, kelompok:Kelompok,
                           asisten:Asisten, laboratorium:Labs,
                           slot_waktu:Slots, praktikum:Praktikum,
                           ketersediaan_kelompok:KK,
                           ketersediaan_asisten:KA}),
    process_dict(Input, Expected, 0),
    process_dict(Permuted, Actual, 0),
    assertion(Expected =@= Actual).

test(large_integer_ids) :-
    load_fixture('valid.json', Input),
    Big is 10^30,
    Candidate = Input.put(_{
        mata_praktikum:[_{id:Big}],
        kelompok:[_{id:Big, jumlah_peserta:20}],
        asisten:[_{id:Big}],
        laboratorium:[_{id:Big, kapasitas:25}],
        slot_waktu:[_{id:Big, hari:1,
                      jam_mulai:"08:00", jam_selesai:"10:00"}],
        praktikum:[_{id:Big, mata_praktikum_id:Big,
                     kelompok_id:Big, asisten_id:Big}],
        ketersediaan_kelompok:[_{kelompok_id:Big, slot_id:Big}],
        ketersediaan_asisten:[_{asisten_id:Big, slot_id:Big}]
    }),
    process_dict(Candidate, Response, 0),
    Response.assignments = [Assignment],
    assertion(Assignment.praktikum_id =:= Big),
    assertion(Assignment.slot_id =:= Big),
    assertion(Assignment.laboratorium_id =:= Big).

test(small_domain_matches_exhaustive_oracle) :-
    small_domain_input(Input),
    once(validate_input(Input, Data)),
    findall(Signature,
            ( solve(Data, Assignments),
              assignment_signature(Assignments, Signature)
            ),
            SolverSolutions0),
    sort(SolverSolutions0, SolverSolutions),
    findall([[1,S1,L1],[2,S2,L2]],
            ( member(S1, [1,2]), member(L1, [1,2]),
              member(S2, [1,2]), member(L2, [1,2]),
              ( S1 =\= S2 ; L1 =\= L2 )
            ),
            OracleSolutions0),
    sort(OracleSolutions0, OracleSolutions),
    assertion(SolverSolutions == OracleSolutions).

test(deterministic_output) :-
    fixture_string('valid.json', String),
    process_json_string(String, First, 0),
    process_json_string(String, Second, 0),
    assertion(First =@= Second).

test(canonical_assignment_order) :-
    load_fixture('valid.json', Input),
    reverse(Input.praktikum, Reversed),
    process_dict(Input.put(praktikum, Reversed), Response, 0),
    maplist(assignment_praktikum_id, Response.assignments, Ids),
    assertion(Ids == [1,2]).

test(source_revision_echo) :-
    fixture_string('valid.json', String),
    process_json_string(String, Response, 0),
    assertion(Response.source_revision == 7).

test(unsatisfiable_status_and_exit) :-
    fixture_string('unsatisfiable.json', String),
    process_json_string(String, Response, ExitCode),
    assertion(ExitCode == 0),
    assertion(Response.status == unsatisfiable),
    assertion(Response.assignments == []).

test(no_state_leak_between_requests) :-
    fixture_string('valid.json', Valid),
    fixture_string('unsatisfiable.json', Unsat),
    process_json_string(Valid, First, 0),
    process_json_string(Unsat, Second, 0),
    process_json_string(Valid, Third, 0),
    assertion(First =@= Third),
    assertion(Second.status == unsatisfiable).

test(cli_stdout_is_single_json_and_exit_zero) :-
    fixture_string('valid.json', Input),
    run_cli(Input, Stdout, Stderr, ExitCode),
    assertion(ExitCode == 0),
    assertion(Stderr == ""),
    assert_single_json_stdout(Stdout, Response),
    assertion(Response.status == success).

test(cli_unsatisfiable_exit_zero) :-
    fixture_string('unsatisfiable.json', Input),
    run_cli(Input, Stdout, Stderr, ExitCode),
    assertion(ExitCode == 0),
    assertion(Stderr == ""),
    assert_single_json_stdout(Stdout, Response),
    assertion(Response.status == unsatisfiable).

test(cli_invalid_input_exit_two) :-
    load_fixture('valid.json', Dict),
    atom_json_dict(Input, Dict.put(schema_version, 2), [as(string)]),
    run_cli(Input, Stdout, Stderr, ExitCode),
    assertion(ExitCode == 2),
    assertion(Stderr == ""),
    assert_single_json_stdout(Stdout, Response),
    assertion(Response.status == invalid_input).

test(cli_malformed_exit_two) :-
    fixture_string('malformed.json', Input),
    run_cli(Input, Stdout, _Stderr, ExitCode),
    assertion(ExitCode == 2),
    assert_single_json_stdout(Stdout, Response),
    assertion(Response.status == invalid_input).

test(cli_internal_error_exit_three_and_sanitized) :-
    fixture_string('valid.json', Input),
    run_fault_cli(Input, Stdout, Stderr, ExitCode),
    assertion(ExitCode == 3),
    assert_single_json_stdout(Stdout, Response),
    assertion(Response.status == internal_error),
    assertion(\+ sub_string(Stdout, _, _, _, "test_fault")),
    assertion(sub_string(Stderr, _, _, _, "Solver internal error")),
    assertion(\+ sub_string(Stderr, _, _, _, "source_revision")),
    assertion(\+ sub_string(Stderr, _, _, _, "praktikum")).

run_cli(Input, Stdout, Stderr, ExitCode) :-
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
    write(In, Input),
    close(In),
    read_string(Out, _, Stdout),
    read_string(Err, _, Stderr),
    close(Out),
    close(Err),
    process_wait(Pid, exit(ExitCode)).

run_fault_cli(Input, Stdout, Stderr, ExitCode) :-
    source_file(fault_cli:main, FaultCliPath),
    run_cli_file(FaultCliPath, 'fault_cli:main', Input,
                 Stdout, Stderr, ExitCode).

run_cli_file(CliPath, Goal, Input, Stdout, Stderr, ExitCode) :-
    current_prolog_flag(executable, Executable),
    process_create(Executable,
                   ['-q', '-f', none, '-s', CliPath, '-g', Goal, '-t', halt],
                   [stdin(pipe(In)), stdout(pipe(Out)), stderr(pipe(Err)),
                    process(Pid)]),
    set_stream(In, encoding(utf8)),
    set_stream(Out, encoding(utf8)),
    set_stream(Err, encoding(utf8)),
    write(In, Input),
    close(In),
    read_string(Out, _, Stdout),
    read_string(Err, _, Stderr),
    close(Out),
    close(Err),
    process_wait(Pid, exit(ExitCode)).

assert_single_json_stdout(Stdout, Response) :-
    assertion(sub_string(Stdout, _, 1, 0, "\n")),
    string_length(Stdout, Length),
    BodyLength is Length - 1,
    sub_string(Stdout, 0, BodyLength, 1, Body),
    assertion(\+ sub_string(Body, _, _, _, "\n")),
    atom_json_dict(Body, Response, [value_string_as(atom)]).

small_domain_input(Input) :-
    load_fixture('valid.json', Base),
    Input = Base.put(_{
        asisten:[_{id:1}, _{id:2}],
        laboratorium:[_{id:1, kapasitas:25}, _{id:2, kapasitas:25}],
        praktikum:[
            _{id:1, mata_praktikum_id:1, kelompok_id:1, asisten_id:1},
            _{id:2, mata_praktikum_id:1, kelompok_id:2, asisten_id:2}
        ],
        ketersediaan_asisten:[
            _{asisten_id:1, slot_id:1}, _{asisten_id:1, slot_id:2},
            _{asisten_id:2, slot_id:1}, _{asisten_id:2, slot_id:2}
        ]
    }).

assignment_signature(Assignments, Signature) :-
    maplist(assignment_tuple, Assignments, Signature).

assignment_tuple(Assignment,
                 [Assignment.praktikum_id,
                  Assignment.slot_id,
                  Assignment.laboratorium_id]).

:- end_tests(smart_lab_solver).
