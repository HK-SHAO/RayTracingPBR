extends Node

@export var camera: Camera3D

var material: ShaderMaterial


func _ready() -> void:
    material = get_parent().material


func _process(_delta: float) -> void:

    var camera_position := camera.transform.origin
    var camera_rotation := camera.transform.basis

    material.set_shader_parameter(
        "camera_position", camera_position)

    material.set_shader_parameter(
        "camera_rotation", camera_rotation)
