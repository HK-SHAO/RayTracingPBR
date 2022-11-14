@tool

extends Node

@onready var control: Control = $".."
@onready var viewport: SubViewport = $"../.."


func _process(_delta):
    control.size = viewport.size
