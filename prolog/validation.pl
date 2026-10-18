:- module(validation, [validate_input/2]).

:- use_module(library(lists)).
:- use_module(library(pairs)).

validate_input(Input, Normalized) :-
    require_dict(Input, "", input),
    exact_keys(Input,
               [schema_version, source_revision, mata_praktikum, kelompok,
                asisten, laboratorium, slot_waktu, praktikum,
                ketersediaan_kelompok, ketersediaan_asisten],
               ""),
    require_integer_field(Input, schema_version, 1, SchemaVersion),
    ( SchemaVersion =:= 1
    -> true
    ;  invalid('UNSUPPORTED_SCHEMA_VERSION',
               'schema_version harus bernilai 1.', 'schema_version')
    ),
    require_nonnegative_integer_field(Input, source_revision, SourceRevision),
    require_list_field(Input, mata_praktikum, Mata0),
    require_list_field(Input, kelompok, Kelompok0),
    require_list_field(Input, asisten, Asisten0),
    require_list_field(Input, laboratorium, Lab0),
    require_list_field(Input, slot_waktu, Slot0),
    require_list_field(Input, praktikum, Praktikum0),
    require_list_field(Input, ketersediaan_kelompok, KK0),
    require_list_field(Input, ketersediaan_asisten, KA0),
    validate_simple_ids(Mata0, mata_praktikum, Mata),
    validate_kelompok(Kelompok0, Kelompok),
    validate_simple_ids(Asisten0, asisten, Asisten),
    validate_laboratorium(Lab0, Laboratorium),
    validate_slots(Slot0, SlotWaktu),
    ids(Mata, MataIds),
    ids(Kelompok, KelompokIds),
    ids(Asisten, AsistenIds),
    ids(SlotWaktu, SlotIds),
    validate_praktikum(Praktikum0, MataIds, KelompokIds, AsistenIds, Praktikum),
    validate_availability(KK0, kelompok_id, KelompokIds, SlotIds,
                          ketersediaan_kelompok, KK),
    validate_availability(KA0, asisten_id, AsistenIds, SlotIds,
                          ketersediaan_asisten, KA),
    Normalized = _{
        schema_version:1,
        source_revision:SourceRevision,
        mata_praktikum:Mata,
        kelompok:Kelompok,
        asisten:Asisten,
        laboratorium:Laboratorium,
        slot_waktu:SlotWaktu,
        praktikum:Praktikum,
        ketersediaan_kelompok:KK,
        ketersediaan_asisten:KA
    }.

validate_simple_ids(Items0, Name, Items) :-
    indexed_maplist(validate_simple_id(Name), Items0, Items1),
    sort_by_id(Items1, Items),
    ensure_unique_ids(Items, Name).

validate_simple_id(Name, Index, Item, _{id:Id}) :-
    item_path(Name, Index, Path),
    require_dict(Item, Path, Name),
    exact_keys(Item, [id], Path),
    require_positive_integer_field_at(Item, id, Path, Id).

validate_kelompok(Items0, Items) :-
    indexed_maplist(validate_kelompok_item, Items0, Items1),
    sort_by_id(Items1, Items),
    ensure_unique_ids(Items, kelompok).

validate_kelompok_item(Index, Item, _{id:Id, jumlah_peserta:Jumlah}) :-
    item_path(kelompok, Index, Path),
    require_dict(Item, Path, kelompok),
    exact_keys(Item, [id, jumlah_peserta], Path),
    require_positive_integer_field_at(Item, id, Path, Id),
    require_positive_integer_field_at(Item, jumlah_peserta, Path, Jumlah).

validate_laboratorium(Items0, Items) :-
    indexed_maplist(validate_lab_item, Items0, Items1),
    sort_by_id(Items1, Items),
    ensure_unique_ids(Items, laboratorium).

validate_lab_item(Index, Item, _{id:Id, kapasitas:Kapasitas}) :-
    item_path(laboratorium, Index, Path),
    require_dict(Item, Path, laboratorium),
    exact_keys(Item, [id, kapasitas], Path),
    require_positive_integer_field_at(Item, id, Path, Id),
    require_positive_integer_field_at(Item, kapasitas, Path, Kapasitas).

validate_slots(Items0, Items) :-
    indexed_maplist(validate_slot_item, Items0, Items1),
    sort_by_id(Items1, Items),
    ensure_unique_ids(Items, slot_waktu),
    ensure_slots_do_not_overlap(Items).

validate_slot_item(Index, Item, Slot) :-
    item_path(slot_waktu, Index, Path),
    require_dict(Item, Path, slot_waktu),
    exact_keys(Item, [id, hari, jam_mulai, jam_selesai], Path),
    require_positive_integer_field_at(Item, id, Path, Id),
    require_integer_field_at(Item, hari, Path, Hari),
    ( between(1, 5, Hari)
    -> true
    ;  invalid('VALIDATION_ERROR', 'hari harus berada pada rentang 1 sampai 5.',
               Path)
    ),
    require_string_field_at(Item, jam_mulai, Path, MulaiString),
    require_string_field_at(Item, jam_selesai, Path, SelesaiString),
    field_path(Path, jam_mulai, MulaiPath),
    field_path(Path, jam_selesai, SelesaiPath),
    parse_time(MulaiString, Mulai, MulaiPath),
    parse_time(SelesaiString, Selesai, SelesaiPath),
    ( Selesai - Mulai =:= 120
    -> true
    ;  invalid('VALIDATION_ERROR', 'Durasi slot harus tepat 120 menit.',
               Path)
    ),
    Slot = _{id:Id, hari:Hari, jam_mulai:MulaiString,
             jam_selesai:SelesaiString, mulai_menit:Mulai,
             selesai_menit:Selesai}.

validate_praktikum(Items0, MataIds, KelompokIds, AsistenIds, Items) :-
    indexed_maplist(validate_praktikum_item(MataIds, KelompokIds, AsistenIds),
                    Items0, Items1),
    sort_by_id(Items1, Items),
    ensure_unique_ids(Items, praktikum).

validate_praktikum_item(MataIds, KelompokIds, AsistenIds,
                        Index, Item, Clean) :-
    item_path(praktikum, Index, Path),
    require_dict(Item, Path, praktikum),
    exact_keys(Item, [id, mata_praktikum_id, kelompok_id, asisten_id],
               Path),
    require_positive_integer_field_at(Item, id, Path, Id),
    require_positive_integer_field_at(Item, mata_praktikum_id, Path, MataId),
    require_positive_integer_field_at(Item, kelompok_id, Path, KelompokId),
    require_positive_integer_field_at(Item, asisten_id, Path, AsistenId),
    field_path(Path, mata_praktikum_id, MataPath),
    field_path(Path, kelompok_id, KelompokPath),
    field_path(Path, asisten_id, AsistenPath),
    require_reference(MataId, MataIds, MataPath),
    require_reference(KelompokId, KelompokIds, KelompokPath),
    require_reference(AsistenId, AsistenIds, AsistenPath),
    Clean = _{id:Id, mata_praktikum_id:MataId,
              kelompok_id:KelompokId, asisten_id:AsistenId}.

validate_availability(Items0, OwnerKey, OwnerIds, SlotIds, Name, Items) :-
    indexed_maplist(validate_availability_item(OwnerKey, OwnerIds, SlotIds, Name),
                    Items0, Items1),
    map_list_to_pairs(availability_key(OwnerKey), Items1, Pairs),
    keysort(Pairs, SortedPairs),
    pairs_values(SortedPairs, Items),
    ensure_unique_pairs(Items, OwnerKey, Name).

validate_availability_item(OwnerKey, OwnerIds, SlotIds, Name,
                           Index, Item, Clean) :-
    item_path(Name, Index, Path),
    require_dict(Item, Path, Name),
    exact_keys(Item, [OwnerKey, slot_id], Path),
    require_positive_integer_field_at(Item, OwnerKey, Path, OwnerId),
    require_positive_integer_field_at(Item, slot_id, Path, SlotId),
    field_path(Path, OwnerKey, OwnerPath),
    field_path(Path, slot_id, SlotPath),
    require_reference(OwnerId, OwnerIds, OwnerPath),
    require_reference(SlotId, SlotIds, SlotPath),
    get_dict(OwnerKey, Item, OwnerId),
    Clean = Item.put(slot_id, SlotId).

require_dict(Value, Path, _) :-
    ( is_dict(Value)
    -> true
    ;  invalid('VALIDATION_ERROR', 'Nilai harus berupa objek JSON.', Path)
    ).

exact_keys(Dict, Expected, Path) :-
    dict_keys(Dict, Actual0),
    sort(Actual0, Actual),
    sort(Expected, SortedExpected),
    ( Actual == SortedExpected
    -> true
    ;  invalid('UNKNOWN_FIELD', 'Field objek tidak sesuai schema version 1.', Path)
    ).

require_list_field(Dict, Key, Value) :-
    ( get_dict(Key, Dict, Value), is_list(Value)
    -> true
    ;  atom_string(Key, Path),
       invalid('VALIDATION_ERROR', 'Field wajib berupa array.', Path)
    ).

require_integer_field(Dict, Key, _, Value) :-
    ( get_dict(Key, Dict, Value), integer(Value)
    -> true
    ;  atom_string(Key, Path),
       invalid('VALIDATION_ERROR', 'Field wajib berupa integer.', Path)
    ).

require_nonnegative_integer_field(Dict, Key, Value) :-
    require_integer_field(Dict, Key, 0, Value),
    ( Value >= 0
    -> true
    ;  atom_string(Key, Path),
       invalid('VALIDATION_ERROR', 'Field wajib berupa integer non-negatif.', Path)
    ).

require_positive_integer_field(Dict, Key, Value) :-
    require_integer_field(Dict, Key, 0, Value),
    ( Value > 0
    -> true
    ;  atom_string(Key, Path),
       invalid('VALIDATION_ERROR', 'Field wajib berupa integer positif.', Path)
    ).

require_string_field(Dict, Key, Value) :-
    ( get_dict(Key, Dict, Value), string(Value)
    -> true
    ;  atom_string(Key, Path),
       invalid('VALIDATION_ERROR', 'Field wajib berupa string.', Path)
    ).

require_integer_field_at(Dict, Key, BasePath, Value) :-
    ( get_dict(Key, Dict, Value), integer(Value)
    -> true
    ;  field_path(BasePath, Key, Path),
       invalid('VALIDATION_ERROR', 'Field wajib berupa integer.', Path)
    ).

require_positive_integer_field_at(Dict, Key, BasePath, Value) :-
    require_integer_field_at(Dict, Key, BasePath, Value),
    ( Value > 0
    -> true
    ;  field_path(BasePath, Key, Path),
       invalid('VALIDATION_ERROR', 'Field wajib berupa integer positif.', Path)
    ).

require_string_field_at(Dict, Key, BasePath, Value) :-
    ( get_dict(Key, Dict, Value), string(Value)
    -> true
    ;  field_path(BasePath, Key, Path),
       invalid('VALIDATION_ERROR', 'Field wajib berupa string.', Path)
    ).

require_reference(Id, Ids, Path) :-
    ( memberchk(Id, Ids)
    -> true
    ;  invalid('INVALID_REFERENCE', 'Referensi ID tidak ditemukan.', Path)
    ).

parse_time(String, Minutes, Path) :-
    ( string_length(String, 5),
      sub_string(String, 2, 1, 2, ":"),
      sub_string(String, 0, 2, _, HourString),
      sub_string(String, 3, 2, 0, MinuteString),
      catch(number_string(Hour, HourString), _, fail), integer(Hour),
      catch(number_string(Minute, MinuteString), _, fail), integer(Minute),
      between(0, 23, Hour), between(0, 59, Minute)
    -> Minutes is Hour * 60 + Minute
    ;  invalid('VALIDATION_ERROR', 'Waktu harus berformat HH:MM yang valid.', Path)
    ).

ensure_slots_do_not_overlap([]).
ensure_slots_do_not_overlap([Slot|Rest]) :-
    maplist(no_overlap(Slot), Rest),
    ensure_slots_do_not_overlap(Rest).

no_overlap(A, B) :-
    ( A.hari =\= B.hari
    -> true
    ;  A.selesai_menit =< B.mulai_menit
    -> true
    ;  B.selesai_menit =< A.mulai_menit
    -> true
    ;  invalid('VALIDATION_ERROR', 'Slot aktif pada hari yang sama tidak boleh overlap.',
               'slot_waktu')
    ).

ensure_unique_ids([], _).
ensure_unique_ids([_], _).
ensure_unique_ids([A,B|Rest], Name) :-
    ( A.id =:= B.id
    -> format(string(Path), '~w[].id', [Name]),
       invalid('DUPLICATE_ID', 'ID harus unik dalam satu array.', Path)
    ;  ensure_unique_ids([B|Rest], Name)
    ).

ensure_unique_pairs([], _, _).
ensure_unique_pairs([_], _, _).
ensure_unique_pairs([A,B|Rest], OwnerKey, Name) :-
    get_dict(OwnerKey, A, OwnerA),
    get_dict(OwnerKey, B, OwnerB),
    ( OwnerA =:= OwnerB, A.slot_id =:= B.slot_id
    -> atom_string(Name, Path),
       invalid('DUPLICATE_AVAILABILITY', 'Pasangan availability harus unik.', Path)
    ;  ensure_unique_pairs([B|Rest], OwnerKey, Name)
    ).

ids(Items, Ids) :- maplist(item_id, Items, Ids).
item_id(Item, Id) :- Id = Item.id.

sort_by_id(Items, Sorted) :-
    map_list_to_pairs(item_id, Items, Pairs),
    keysort(Pairs, SortedPairs),
    pairs_values(SortedPairs, Sorted).

availability_key(OwnerKey, Item, OwnerId-SlotId) :-
    get_dict(OwnerKey, Item, OwnerId),
    SlotId = Item.slot_id.

item_path(Name, Index, Path) :-
    format(string(Path), '~w[~d]', [Name, Index]).

field_path(Base, Key, Path) :-
    format(string(Path), '~w.~w', [Base, Key]).

indexed_maplist(Predicate, Input, Output) :-
    indexed_maplist(Input, Output, 0, Predicate).

indexed_maplist([], [], _, _).
indexed_maplist([Item|Items], [Clean|CleanItems], Index, Predicate) :-
    call(Predicate, Index, Item, Clean),
    NextIndex is Index + 1,
    indexed_maplist(Items, CleanItems, NextIndex, Predicate).

invalid(Code, Message, Path) :-
    throw(validation_error(Code, Message, Path)).
