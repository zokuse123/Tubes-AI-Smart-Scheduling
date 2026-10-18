:- begin_tests(benchmark_robustness).

:- use_module('../benchmark').
:- use_module('../benchmark_optimization', []).
:- use_module('../solver').
:- use_module('../validation').

test(configured_dataset_sizes) :-
    forall(member(Size,
                  [size{kelompok:5,asisten:5,laboratorium:3,
                        praktikum:10,slot_waktu:10},
                   size{kelompok:10,asisten:10,laboratorium:5,
                        praktikum:20,slot_waktu:15},
                   size{kelompok:20,asisten:20,laboratorium:10,
                        praktikum:40,slot_waktu:25}]),
           ( benchmark:make_dataset(Size, feasible, Data, Witness),
             length(Data.kelompok, Size.kelompok),
             length(Data.asisten, Size.asisten),
             length(Data.laboratorium, Size.laboratorium),
             length(Data.praktikum, Size.praktikum),
             length(Data.slot_waktu, Size.slot_waktu),
             benchmark:verify_solution(Data, Witness) )).

test(all_labeling_strategies_produce_valid_solution) :-
    Size = size{kelompok:5,asisten:5,laboratorium:3,
                praktikum:10,slot_waktu:10},
    forall(member(Name-Options,
                  [ffc_up-[ffc,up], ff_up-[ff,up],
                   leftmost_up-[leftmost,up]]),
           ( benchmark_dataset(test-feasible, Size, Name-Options,
                               run{repetitions:1,timeout_seconds:5}, Result),
             assertion(Result.status == success) )).

test(controlled_unsatisfiable_is_not_timeout) :-
    Size = size{kelompok:5,asisten:5,laboratorium:3,
                praktikum:10,slot_waktu:10},
    benchmark_dataset(test-controlled_unsatisfiable, Size, ffc_up-[ffc,up],
                      run{repetitions:1,timeout_seconds:5}, Result),
    assertion(Result.status == unsatisfiable).

test(exact_capacity_is_accepted) :-
    Size = size{kelompok:1,asisten:1,laboratorium:1,
                praktikum:1,slot_waktu:1},
    benchmark:make_dataset(Size, feasible, Raw, _),
    Raw.laboratorium = [Lab],
    ExactLab = Lab.put(kapasitas, 20),
    Candidate = Raw.put(laboratorium, [ExactLab]),
    once(validate_input(Candidate, Data)),
    once(solve(Data, Assignments)),
    benchmark:verify_solution(Data, Assignments).

test(limited_singleton_domain) :-
    Size = size{kelompok:1,asisten:1,laboratorium:1,
                praktikum:1,slot_waktu:5},
    benchmark:make_dataset(Size, feasible, Raw, _),
    Candidate = Raw.put(_{
        ketersediaan_kelompok:[_{kelompok_id:1,slot_id:5}],
        ketersediaan_asisten:[_{asisten_id:1,slot_id:5}]}),
    once(validate_input(Candidate, Data)),
    once(solve(Data, [Assignment])),
    assertion(Assignment.slot_id =:= 5).

test(shared_group_and_assistant_remain_satisfiable) :-
    Size = size{kelompok:2,asisten:2,laboratorium:2,
                praktikum:6,slot_waktu:6},
    benchmark:make_dataset(Size, feasible, Raw, _),
    once(validate_input(Raw, Data)),
    once(solve(Data, Assignments)),
    benchmark:verify_solution(Data, Assignments).

test(multiple_solutions_are_enumerable, [nondet]) :-
    Size = size{kelompok:1,asisten:1,laboratorium:2,
                praktikum:1,slot_waktu:2},
    benchmark:make_dataset(Size, feasible, Raw, _),
    once(validate_input(Raw, Data)),
    findnsols(2, Assignments, solve(Data, Assignments), Solutions),
    assertion(Solutions = [_,_]),
    maplist(benchmark:verify_solution(Data), Solutions).

test(repeated_default_solution_is_consistent) :-
    Size = size{kelompok:5,asisten:5,laboratorium:3,
                praktikum:10,slot_waktu:10},
    benchmark:make_dataset(Size, feasible, Raw, _),
    once(validate_input(Raw, Data)),
    once(solve(Data, First)),
    once(solve(Data, Second)),
    assertion(First =@= Second).

test(default_strategy_is_leftmost_enum_up) :-
    Size = size{kelompok:5,asisten:5,laboratorium:3,
                praktikum:10,slot_waktu:10},
    benchmark:make_dataset(Size, feasible, Raw, _),
    once(validate_input(Raw, Data)),
    once(solve(Data, Default)),
    once(solve_with_strategy(Data, global([leftmost,enum,up]), Explicit)),
    assertion(Default =@= Explicit).

test(alternative_strategies_match_exhaustive_solution_set) :-
    exhaustive_data(Data),
    strategy_solutions(Data, global([ffc,up]), Baseline),
    forall(member(Strategy,
                  [paired([leftmost,up]), combined([ffc,up]),
                   global([leftmost,step,up]),
                   global([leftmost,enum,up]),
                   global([leftmost,bisect,up])]),
           ( strategy_solutions(Data, Strategy, Actual),
             assertion(Actual == Baseline) )).

test(alternative_strategies_are_deterministic) :-
    exhaustive_data(Data),
    forall(member(Strategy,
                  [paired([leftmost,up]), combined([ffc,up])]),
           ( once(solve_with_strategy(Data, Strategy, First)),
             once(solve_with_strategy(Data, Strategy, Second)),
             assertion(First =@= Second) )).

test(instrumented_phases_preserve_canonical_output) :-
    exhaustive_data(Data),
    construct_model(Data, paired([leftmost,up]), Model),
    once(search_model(Model)),
    materialize_model(Model, Assignments),
    maplist(benchmark_assignment_id, Assignments, Ids),
    assertion(Ids == [1,2]),
    benchmark:verify_solution(Data, Assignments).

test(all_feasible_corpus_witnesses_are_independently_valid) :-
    forall((benchmark_optimization:corpus_case(_, feasible, Raw, Witness),
            once(validate_input(Raw, Data))),
           benchmark:verify_solution(Data, Witness)).

exhaustive_data(Data) :-
    Size = size{kelompok:2,asisten:2,laboratorium:2,
                praktikum:2,slot_waktu:2},
    benchmark:make_dataset(Size, feasible, Raw, _),
    once(validate_input(Raw, Data)).

strategy_solutions(Data, Strategy, Solutions) :-
    findall(Signature,
            ( solve_with_strategy(Data, Strategy, Assignments),
              maplist(benchmark_assignment_tuple, Assignments, Signature)
            ), All),
    sort(All, Solutions).

benchmark_assignment_id(A, A.praktikum_id).
benchmark_assignment_tuple(A,
                           [A.praktikum_id,A.slot_id,A.laboratorium_id]).

:- end_tests(benchmark_robustness).
