:- module(benchmark_optimization, [main/0, corpus_case/4]).

:- use_module(library(http/json)).
:- use_module(library(process)).
:- use_module(library(pairs)).
:- use_module(library(random)).
:- use_module(library(readutil)).
:- use_module(library(time)).
:- use_module(benchmark, []).
:- use_module(solver).
:- use_module(solver_cli, []).
:- use_module(validation).

strategy(global_ffc_up, global([ffc, up])).
strategy(global_ff_up, global([ff, up])).
strategy(global_leftmost_up, global([leftmost, up])).
strategy(paired_leftmost_up, paired([leftmost, up])).
strategy(combined_ffc_up, combined([ffc, up])).
strategy(leftmost_step_up, global([leftmost, step, up])).
strategy(leftmost_enum_up, global([leftmost, enum, up])).
strategy(leftmost_bisect_up, global([leftmost, bisect, up])).

main :-
    Repetitions = 2,
    TimeoutSeconds = 2,
    findall(Result,
            ( corpus_case(CaseName, Expected, Raw, Witness),
              once(validate_input(Raw, Data)),
              prove_fixture(Expected, Data, Witness),
              strategy(StrategyName, Strategy),
              run_repetitions(Repetitions, TimeoutSeconds, Data, Expected,
                              Strategy, Observations),
              summarize_case(CaseName, Expected, StrategyName,
                             Observations, Result)
            ),
            Results),
    cli_benchmark(Cli),
    environment(Environment),
    Report = _{clock:"statistics(walltime) monotonic process wall-clock",
               repetitions:Repetitions,
               timeout_seconds:TimeoutSeconds,
               environment:Environment,
               internal_results:Results,
               cli_end_to_end:Cli},
    json_write_dict(current_output, Report, [width(0)]), nl.

run_repetitions(Count, Timeout, Data, Expected, Strategy, Observations) :-
    findall(Observation,
            ( between(1, Count, _),
              run_internal(Data, Expected, Strategy, Timeout, Observation)
            ), Observations).

run_internal(Data, Expected, Strategy, Timeout, Observation) :-
    wall_ms(Start),
    catch(call_with_time_limit(
              Timeout,
              measured_pipeline(Data, Expected, Strategy, Start, Observation)),
          Error,
          exceptional_observation(Error, Start, Observation)).

measured_pipeline(Data, _Expected, Strategy, Start, Observation) :-
    ( construct_model(Data, Strategy, Model) ->
        wall_ms(Constructed),
        Construction is Constructed - Start,
        ( once(search_model(Model)) ->
            wall_ms(Searched),
            Search is Searched - Constructed,
            materialize_model(Model, Assignments),
            wall_ms(Materialized),
            Materialization is Materialized - Searched,
            benchmark:verify_solution(Data, Assignments),
            wall_ms(Verified),
            Verification is Verified - Materialized,
            Total is Verified - Start,
            length(Assignments, Count),
            benchmark:assignment_fingerprint(Assignments, Fingerprint),
            Status = success,
            Metrics = _{construction_ms:Construction, search_ms:Search,
                        materialization_ms:Materialization,
                        verification_ms:Verification, total_ms:Total}
        ;   wall_ms(Finished),
            Search is Finished - Constructed,
            Total is Finished - Start,
            Assignments = [], Count = 0, Fingerprint = null,
            Status = unsatisfiable,
            Metrics = _{construction_ms:Construction, search_ms:Search,
                        materialization_ms:0, verification_ms:0,
                        total_ms:Total}
        )
    ;   wall_ms(Finished),
        Total is Finished - Start,
        Assignments = [], Count = 0, Fingerprint = null,
        Status = unsatisfiable,
        Metrics = _{construction_ms:Total, search_ms:0,
                    materialization_ms:0, verification_ms:0,
                    total_ms:Total}
    ),
    Observation = _{status:Status, assignment_count:Count,
                    fingerprint:Fingerprint, metrics:Metrics},
    Assignments = Assignments.

exceptional_observation(time_limit_exceeded, Start, Observation) :-
    !, wall_ms(Finished), Total is Finished - Start,
    Observation = _{status:timeout, assignment_count:0, fingerprint:null,
                    metrics:_{construction_ms:null, search_ms:null,
                              materialization_ms:null, verification_ms:null,
                              total_ms:Total}}.
exceptional_observation(Error, Start, Observation) :-
    wall_ms(Finished), Total is Finished - Start,
    message_to_string(Error, Message),
    Observation = _{status:internal_error, assignment_count:0,
                    fingerprint:null, diagnostic:Message,
                    metrics:_{construction_ms:null, search_ms:null,
                              materialization_ms:null, verification_ms:null,
                              total_ms:Total}}.

summarize_case(Case, Expected, Strategy, Observations, Result) :-
    maplist(observation_status, Observations, Statuses),
    include(==(success), Statuses, Successes), length(Successes, SuccessCount),
    include(==(timeout), Statuses, Timeouts), length(Timeouts, TimeoutCount),
    phase_summary(Observations, construction_ms, Construction),
    phase_summary(Observations, search_ms, Search),
    phase_summary(Observations, materialization_ms, Materialization),
    phase_summary(Observations, verification_ms, Verification),
    phase_summary(Observations, total_ms, Total),
    Result = _{case:Case, expected:Expected, strategy:Strategy,
               statuses:Statuses, successes:SuccessCount,
               timeouts:TimeoutCount,
               latency_ms:_{construction:Construction, search:Search,
                            materialization:Materialization,
                            verification:Verification, total:Total}}.

observation_status(O, O.status).

phase_summary(Observations, Key, Summary) :-
    findall(Value,
            ( member(O, Observations), get_dict(Key, O.metrics, Value),
              number(Value) ), Values),
    ( Values == [] -> Summary = null
    ; msort(Values, Sorted), Sorted = [Min|_], last(Sorted, Max),
      length(Sorted, Length), Middle is Length // 2,
      nth0(Middle, Sorted, Median),
      Summary = _{min:Min, median:Median, max:Max}
    ).

prove_fixture(feasible, Data, Witness) :-
    benchmark:verify_solution(Data, Witness).
prove_fixture(unsatisfiable, _, none).

corpus_case(loose_small, feasible, Raw, Witness) :-
    size(small, Size), benchmark:make_dataset(Size, feasible, Raw, Witness).
corpus_case(loose_medium_seed_1, feasible, Raw, Witness) :-
    size(medium, Size), benchmark:make_dataset(Size, feasible, Raw, Witness).
corpus_case(loose_medium_seed_42, feasible, Raw, Witness) :-
    size(medium, Size), benchmark:make_dataset(Size, feasible, Base, _),
    seeded_ownership(Base, 42, Raw, Witness).
corpus_case(moderate_availability, feasible, Raw, Witness) :-
    size(medium, Size), benchmark:make_dataset(Size, feasible, Base, Witness),
    availability_for_witness(Base, Witness, 1, Raw).
corpus_case(tight_availability, feasible, Raw, Witness) :-
    size(medium, Size), benchmark:make_dataset(Size, feasible, Base, Witness),
    availability_for_witness(Base, Witness, 0, Raw).
corpus_case(heterogeneous_capacity, feasible, Raw, Witness) :-
    size(medium, Size), benchmark:make_dataset(Size, feasible, Base, Witness),
    heterogeneous_labs(Base, Raw).
corpus_case(dense_conflicts, feasible, Raw, Witness) :-
    size(small, Size), benchmark:make_dataset(Size, feasible, Base, Witness),
    shared_owners(Base, Raw).
corpus_case(varied_slots_labs, feasible, Raw, Witness) :-
    Size = size{kelompok:8,asisten:8,laboratorium:4,
                praktikum:16,slot_waktu:20},
    benchmark:make_dataset(Size, feasible, Raw, Witness).
corpus_case(unsat_easy_availability, unsatisfiable, Raw, none) :-
    size(small, Size),
    benchmark:make_dataset(Size, controlled_unsatisfiable, Raw, _).
corpus_case(unsat_deep_pigeonhole, unsatisfiable, Raw, none) :-
    Size = size{kelompok:1,asisten:6,laboratorium:6,
                praktikum:6,slot_waktu:5},
    benchmark:make_dataset(Size, feasible, Raw, _).

size(small, size{kelompok:5,asisten:5,laboratorium:3,
                 praktikum:10,slot_waktu:10}).
size(medium, size{kelompok:10,asisten:10,laboratorium:5,
                  praktikum:20,slot_waktu:15}).

seeded_ownership(Base, Seed, Raw, Witness) :-
    set_random(seed(Seed)),
    random_permutation(Base.praktikum, Shuffled),
    findall(P2-W,
            ( nth1(NewId, Shuffled, P),
              P2 = P.put(id, NewId),
              SlotId is ((P.id - 1) mod 15) + 1,
              LabId is ((P.id - 1) // 15) + 1,
              W = _{praktikum_id:NewId, slot_id:SlotId,
                    laboratorium_id:LabId}
            ), Pairs),
    pairs_keys_values(Pairs, Practices, Witness0),
    sort(Practices, SortedPractices),
    sort_witness(Witness0, Witness),
    Raw = Base.put(praktikum, SortedPractices).

sort_witness(Witness0, Witness) :-
    findall(Id-W, (member(W, Witness0), Id = W.praktikum_id), Pairs),
    keysort(Pairs, Sorted), pairs_values(Sorted, Witness).

availability_for_witness(Base, Witness, ExtraCount, Raw) :-
    findall(_{kelompok_id:Owner, slot_id:Slot},
            witness_owner_slot(Base, Witness, kelompok_id, Owner, Slot), GA0),
    findall(_{asisten_id:Owner, slot_id:Slot},
            witness_owner_slot(Base, Witness, asisten_id, Owner, Slot), AA0),
    add_availability_extras(GA0, kelompok_id, ExtraCount, GA),
    add_availability_extras(AA0, asisten_id, ExtraCount, AA),
    Raw = Base.put(_{ketersediaan_kelompok:GA,
                     ketersediaan_asisten:AA}).

witness_owner_slot(Base, Witness, Key, Owner, Slot) :-
    member(W, Witness), member(P, Base.praktikum),
    P.id =:= W.praktikum_id, get_dict(Key, P, Owner), Slot = W.slot_id.

add_availability_extras(Items, _, 0, Sorted) :- !, sort(Items, Sorted).
add_availability_extras(Items, Key, _, Sorted) :-
    findall(Extra,
            ( member(Item, Items), get_dict(Key, Item, Owner),
              Next is (Item.slot_id mod 15) + 1,
              dict_create(Extra, _, [Key-Owner, slot_id-Next])
            ), Extras),
    append(Items, Extras, All), sort(All, Sorted).

heterogeneous_labs(Base, Raw) :-
    findall(L2,
            ( member(L, Base.laboratorium),
              ( L.id =:= 1 -> Capacity = 20
              ; L.id =:= 2 -> Capacity = 25
              ; Capacity = 19 ),
              L2 = L.put(kapasitas, Capacity)
            ), Labs),
    Raw = Base.put(laboratorium, Labs).

shared_owners(Base, Raw) :-
    findall(Updated,
            ( member(P, Base.praktikum),
              Updated = P.put(_{kelompok_id:1, asisten_id:1}) ),
            Practices),
    Raw = Base.put(praktikum, Practices).

cli_benchmark(Result) :-
    benchmark_fixture_path('contract-success-multiple.json', Path),
    read_file_to_string(Path, Input, [encoding(utf8)]),
    findall(Duration,
            ( between(1, 3, _), cli_once(Input, 2, Duration) ),
            Durations),
    msort(Durations, [Min,Median,Max]),
    Result = _{case:contract_success_multiple, repetitions:3,
               timeout_seconds:2,
               duration_ms:_{min:Min,median:Median,max:Max}}.

benchmark_fixture_path(Name, Path) :-
    source_file(benchmark_optimization:main, Source),
    file_directory_name(Source, PrologDir),
    directory_file_path(PrologDir, tests, TestDir),
    directory_file_path(TestDir, fixtures, FixtureDir),
    directory_file_path(FixtureDir, Name, Path).

cli_once(Input, Timeout, Duration) :-
    current_prolog_flag(executable, Executable),
    source_file(solver_cli:main, CliPath),
    wall_ms(Start),
    process_create(Executable,
                   ['-q','-f',none,'-s',CliPath,
                    '-g','solver_cli:main','-t',halt],
                   [stdin(pipe(In)),stdout(pipe(Out)),stderr(pipe(Err)),
                    process(Pid)]),
    catch(call_with_time_limit(
              Timeout,
              ( write(In, Input), close(In),
                read_string(Out, _, _), read_string(Err, _, _),
                close(Out), close(Err), process_wait(Pid, exit(0)) )),
          Error,
          ( catch(process_kill(Pid, term), _, true), throw(Error) )),
    wall_ms(End), Duration is End - Start.

wall_ms(Milliseconds) :- statistics(walltime, [Milliseconds, _]).

environment(_{swi_prolog:Version, architecture:Architecture,
              operating_system:windows}) :-
    current_prolog_flag(version_data, swi(Major, Minor, Patch, _)),
    format(string(Version), '~d.~d.~d', [Major, Minor, Patch]),
    current_prolog_flag(arch, Architecture).
