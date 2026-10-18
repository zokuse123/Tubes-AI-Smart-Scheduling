:- module(solver, [solve/2]).

:- use_module(library(clpfd)).
:- use_module(library(ordsets)).

solve(Data, Assignments) :-
    maplist(make_task(Data), Data.praktikum, Tasks),
    constrain_conflicts(Tasks),
    task_variables(Tasks, Variables),
    labeling([ffc, up], Variables),
    maplist(task_assignment, Tasks, Assignments).

make_task(Data, Praktikum, task(Praktikum, SlotVar, LabVar)) :-
    peserta(Data.kelompok, Praktikum.kelompok_id, JumlahPeserta),
    available_slots(Data.ketersediaan_kelompok, kelompok_id,
                    Praktikum.kelompok_id, KelompokSlots),
    available_slots(Data.ketersediaan_asisten, asisten_id,
                    Praktikum.asisten_id, AsistenSlots),
    ord_intersection(KelompokSlots, AsistenSlots, FeasibleSlots),
    capable_labs(Data.laboratorium, JumlahPeserta, FeasibleLabs),
    domain_from_values(SlotVar, FeasibleSlots),
    domain_from_values(LabVar, FeasibleLabs).

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

domain_from_values(Variable, Values) :-
    list_to_fdset(Values, Set),
    Variable in_set Set.

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
