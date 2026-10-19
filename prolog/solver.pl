:- module(solver,
          [ solve/2,
            solve_with_diagnostics/3,
            solve_with_options/3,
            solve_with_strategy/3,
            construct_model/3,
            construct_model/4,
            search_model/1,
            materialize_model/2
          ]).

:- use_module(library(clpfd)).
:- use_module(library(ordsets)).

:- meta_predicate search_and_materialize(0, 0, -).

solve(Data, Assignments) :-
    solve_with_options(Data, [leftmost, enum, up], Assignments).

solve_with_diagnostics(Data, Outcome, DomainCandidates) :-
    construct_model(Data, global([leftmost, enum, up]), Model,
                    DomainCandidates),
    search_and_materialize(search_model(Model),
                           materialize_model(Model, Assignments),
                           SearchOutcome),
    ( SearchOutcome == success
    -> Outcome = success(Assignments)
    ;  Outcome = unsatisfiable
    ).

search_and_materialize(SearchGoal, MaterializeGoal, Outcome) :-
    ( once(call(SearchGoal))
    -> ( once(call(MaterializeGoal))
       -> Outcome = success
       ;  throw(error(solver_materialization_failed,
                      context(solver:search_and_materialize/3,
                              'Search succeeded but assignment materialization failed.')))
       )
    ;  Outcome = unsatisfiable
    ).

solve_with_options(Data, LabelingOptions, Assignments) :-
    solve_with_strategy(Data, global(LabelingOptions), Assignments).

solve_with_strategy(Data, Strategy, Assignments) :-
    construct_model(Data, Strategy, Model),
    search_model(Model),
    materialize_model(Model, Assignments).

construct_model(Data, Strategy, Model) :-
    construct_model(Data, Strategy, Model, _).

construct_model(Data, Strategy, Model, DomainCandidates) :-
    maplist(make_task(Data), Data.praktikum, Tasks, DomainCandidates, Feasibilities),
    ( maplist(==(feasible), Feasibilities),
      constrain_conflicts(Tasks)
    -> strategy_search(Strategy, Tasks, Search),
       Model = solver_model(Tasks, Search, feasible)
    ;  Model = solver_model(Tasks, no_search, inconsistent_model)
    ).

search_model(solver_model(_, _, inconsistent_model)) :-
    !,
    fail.
search_model(solver_model(_, global(Options, Variables), feasible)) :-
    labeling(Options, Variables).
search_model(solver_model(Tasks, paired(Options), feasible)) :-
    maplist(label_task(Options), Tasks).
search_model(solver_model(_, combined(Options, Codes), feasible)) :-
    labeling(Options, Codes).

materialize_model(solver_model(Tasks, _, _), Assignments) :-
    maplist(task_assignment, Tasks, Assignments).

strategy_search(global(Options), Tasks, global(Options, Variables)) :-
    task_variables(Tasks, Variables).
strategy_search(paired(Options), _, paired(Options)).
strategy_search(combined(Options), Tasks, combined(Options, Codes)) :-
    maplist(task_pair_code, Tasks, Codes).

label_task(Options, task(_, Slot, Lab)) :-
    labeling(Options, [Slot, Lab]).

task_pair_code(task(_, Slot, Lab), Code) :-
    fd_set(Slot, SlotSet),
    fdset_to_list(SlotSet, Slots),
    fd_set(Lab, LabSet),
    fdset_to_list(LabSet, Labs),
    findall([Index, SlotValue, LabValue],
            ( nth1(SlotIndex, Slots, SlotValue),
              nth1(LabIndex, Labs, LabValue),
              length(Labs, LabCount),
              Index is (SlotIndex - 1) * LabCount + LabIndex
            ),
            Tuples),
    tuples_in([[Code, Slot, Lab]], Tuples).

make_task(Data, Praktikum, task(Praktikum, SlotVar, LabVar),
          DomainCandidate, Feasibility) :-
    peserta(Data.kelompok, Praktikum.kelompok_id, JumlahPeserta),
    available_slots(Data.ketersediaan_kelompok, kelompok_id,
                    Praktikum.kelompok_id, KelompokSlots),
    available_slots(Data.ketersediaan_asisten, asisten_id,
                    Praktikum.asisten_id, AsistenSlots),
    ord_intersection(KelompokSlots, AsistenSlots, FeasibleSlots),
    capable_labs(Data.laboratorium, JumlahPeserta, FeasibleLabs),
    length(FeasibleSlots, SlotCount),
    length(FeasibleLabs, LaboratoryCount),
    TheoreticalPairs is SlotCount * LaboratoryCount,
    DomainCandidate = _{praktikum_id:Praktikum.id,
                        slot_count:SlotCount,
                        laboratory_count:LaboratoryCount,
                        theoretical_pairs:TheoreticalPairs},
    domain_from_values(SlotVar, FeasibleSlots, SlotFeasibility),
    domain_from_values(LabVar, FeasibleLabs, LabFeasibility),
    ( SlotFeasibility == feasible, LabFeasibility == feasible
    -> Feasibility = feasible
    ;  Feasibility = empty_domain
    ).

peserta([Kelompok|_], Id, Jumlah) :-
    Kelompok.id =:= Id,
    !,
    Jumlah = Kelompok.jumlah_peserta.
peserta([_|Rest], Id, Jumlah) :- peserta(Rest, Id, Jumlah).

available_slots(Availability, OwnerKey, OwnerId, Slots) :-
    findall(SlotId,
            ( member(Item, Availability),
              get_dict(OwnerKey, Item, OwnerId),
              SlotId = Item.slot_id
            ),
            Slots0),
    sort(Slots0, Slots).

capable_labs(Labs, JumlahPeserta, LabIds) :-
    findall(Id,
            ( member(Lab, Labs),
              Lab.kapasitas >= JumlahPeserta,
              Id = Lab.id
            ),
            LabIds).

domain_from_values(Variable, Values, Feasibility) :-
    ( Values == []
    -> Feasibility = empty_domain
    ;  list_to_fdset(Values, Set),
       Variable in_set Set,
       Feasibility = feasible
    ).

constrain_conflicts([]).
constrain_conflicts([Task|Rest]) :-
    maplist(constrain_pair(Task), Rest),
    constrain_conflicts(Rest).

constrain_pair(task(P1, S1, L1), task(P2, S2, L2)) :-
    ( P1.kelompok_id =:= P2.kelompok_id -> S1 #\= S2 ; true ),
    ( P1.asisten_id =:= P2.asisten_id -> S1 #\= S2 ; true ),
    (S1 #= S2) #==> (L1 #\= L2).

task_variables([], []).
task_variables([task(_, Slot, Lab)|Tasks], [Slot,Lab|Variables]) :-
    task_variables(Tasks, Variables).

task_assignment(task(Praktikum, Slot, Lab),
                _{praktikum_id:Praktikum.id,
                  slot_id:Slot,
                  laboratorium_id:Lab}).
