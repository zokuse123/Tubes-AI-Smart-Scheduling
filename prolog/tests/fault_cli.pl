:- module(fault_cli,
          [ main/0,
            main_with_materialization_failure/0,
            main_with_materialization_exception/0,
            injected_failure/3,
            materialization_failure/3,
            materialization_exception/3
          ]).

:- use_module('../solver_cli', []).
:- use_module('../solver', []).

main :-
    solver_cli:main_with_solver(fault_cli:injected_failure).

injected_failure(_, _, _) :-
    throw(test_fault).

main_with_materialization_failure :-
    solver_cli:main_with_solver(fault_cli:materialization_failure).

main_with_materialization_exception :-
    solver_cli:main_with_solver(fault_cli:materialization_exception).

materialization_failure(Data, _, DomainCandidates) :-
    solver:construct_model(Data, global([leftmost, enum, up]), Model,
                           DomainCandidates),
    solver:search_and_materialize(solver:search_model(Model), fail, _).

materialization_exception(Data, _, DomainCandidates) :-
    solver:construct_model(Data, global([leftmost, enum, up]), Model,
                           DomainCandidates),
    solver:search_and_materialize(
        solver:search_model(Model),
        throw(fault_injected_materialization_exception),
        _
    ).
